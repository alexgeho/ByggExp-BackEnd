import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { Client, ClientDocument } from "../clients/schemas/client.schema";
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from "../invoices/schemas/invoice.schema";
import { InvoicesService } from "../invoices/invoices.service";
import { WageBasisService } from "../payroll/wage-basis.service";
import {
  PayrollExport,
  PayrollExportDocument,
} from "../payroll/schemas/payroll-export.schema";
import { UserRole } from "../users/schemas/user.schema";
import {
  decryptToken,
  encryptToken,
  signState,
  verifyState,
} from "./fortnox-crypto";
import {
  ClientLike,
  InvoiceLike,
  buildFortnoxCustomer,
  buildFortnoxInvoice,
  buildFortnoxTaxReduction,
  buildFortnoxWageTransactions,
  customerOrgNumber,
  FortnoxSupplierInvoice,
  mapSupplierInvoice,
  str,
} from "./fortnox-mapping";
import {
  SupplierInvoice,
  SupplierInvoiceDocument,
} from "../supplier-invoices/schemas/supplier-invoice.schema";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import {
  FortnoxConnection,
  FortnoxConnectionDocument,
} from "./schemas/fortnox-connection.schema";

type AuthUser = { role: UserRole; companyId?: string | null; userId?: string };

const AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
const TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
const REVOKE_URL = "https://apps.fortnox.se/oauth-v1/revoke";
const API_BASE = "https://api.fortnox.se/3";
// supplierinvoice joins once it is enabled on the ByggExp integration in the
// Fortnox developer portal (asking for a scope the app lacks fails the
// connect). Until then set FORTNOX_SCOPES to include it.
const DEFAULT_SCOPES = "companyinformation invoice customer salary";
const SUPPLIER_SCOPE = "supplierinvoice";
// Fortnox allows 25 requests per 5 s per token: keep calls ≥ 220 ms apart.
const MIN_CALL_GAP_MS = 220;
const PUSH_CLAIM_MS = 2 * 60_000;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  scope?: string;
};

export class FortnoxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Injectable()
export class FortnoxService {
  private readonly logger = new Logger(FortnoxService.name);
  // One refresh at a time per company: Fortnox refresh tokens are single-use,
  // so two parallel refreshes would lock the company out.
  private readonly refreshing = new Map<string, Promise<string>>();
  private readonly lastCall = new Map<string, number>();

  constructor(
    @InjectModel(FortnoxConnection.name)
    private connectionModel: Model<FortnoxConnectionDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(PayrollExport.name)
    private exportModel: Model<PayrollExportDocument>,
    @InjectModel(SupplierInvoice.name)
    private supplierInvoiceModel: Model<SupplierInvoiceDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private readonly invoicesService: InvoicesService,
    private readonly wageBasisService: WageBasisService,
  ) {}

  // ---- Config / status -----------------------------------------------------

  private config() {
    const clientId = process.env.FORTNOX_CLIENT_ID || "";
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET || "";
    const redirectUri = process.env.FORTNOX_REDIRECT_URI || "";
    if (!clientId || !clientSecret || !redirectUri) return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes: (process.env.FORTNOX_SCOPES || DEFAULT_SCOPES).trim(),
    };
  }

  private requireConfig() {
    const cfg = this.config();
    if (!cfg)
      throw new ServiceUnavailableException("Fortnox is not configured");
    return cfg;
  }

  private companyOf(user: AuthUser): string {
    if (!user?.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return String(user.companyId);
  }

  async status(user: AuthUser) {
    const configured = !!this.config();
    const companyId = user?.companyId ? String(user.companyId) : null;
    const conn = companyId
      ? await this.connectionModel.findOne({ companyId }).lean().exec()
      : null;
    return {
      configured,
      connected: !!conn && !conn.needsReconnect,
      needsReconnect: !!conn?.needsReconnect,
      companyName: conn?.fortnoxCompanyName || "",
      orgNumber: conn?.fortnoxOrgNumber || "",
      connectedAt: conn?.connectedAt || null,
      scopes: conn?.scope ? conn.scope.split(/\s+/).filter(Boolean) : [],
      // false → reconnect once to let ByggExp read supplier invoices.
      supplierInvoices: this.hasScope(conn?.scope, SUPPLIER_SCOPE),
      supplierSyncAt: conn?.supplierSyncAt || null,
    };
  }

  connectUrl(user: AuthUser) {
    const cfg = this.requireConfig();
    const companyId = this.companyOf(user);
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: cfg.scopes,
      state: signState(companyId, String(user.userId || "")),
      access_type: "offline",
      response_type: "code",
    });
    return { url: `${AUTH_URL}?${params.toString()}` };
  }

  // Where the browser lands after Fortnox: back on the admin Profile page.
  private returnUrl(result: "connected" | "error", reason?: string) {
    const base = (
      process.env.FORTNOX_RETURN_URL ||
      `${(process.env.APP_PUBLIC_URL || "https://admin.byggexp.se").replace(/\/+$/, "")}/company/profile`
    ).trim();
    const why = reason
      ? `&reason=${encodeURIComponent(reason.slice(0, 160))}`
      : "";
    return `${base}${base.includes("?") ? "&" : "?"}fortnox=${result}${why}`;
  }

  async handleCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }) {
    const cfg = this.config();
    const state = verifyState(String(query.state || ""));
    if (!cfg || !state || query.error || !query.code) {
      if (query.error)
        this.logger.warn(`Fortnox auth declined: ${query.error}`);
      const reason = !cfg
        ? "not_configured"
        : !state
          ? "invalid_state"
          : query.error || "no_code";
      return this.returnUrl("error", reason);
    }
    try {
      const tokens = await this.tokenRequest(cfg, {
        grant_type: "authorization_code",
        code: String(query.code),
        redirect_uri: cfg.redirectUri,
      });
      const info = await this.fetchJson(
        "GET",
        "/companyinformation",
        tokens.access_token,
      ).catch(() => null);
      const ci = (
        info as { CompanyInformation?: Record<string, string> } | null
      )?.CompanyInformation;
      await this.connectionModel.updateOne(
        { companyId: state.companyId },
        {
          $set: {
            ...this.tokenFields(tokens),
            scope: tokens.scope || cfg.scopes,
            fortnoxCompanyName: ci?.CompanyName || "",
            fortnoxOrgNumber: ci?.OrganizationNumber || "",
            connectedByUserId: state.userId || null,
            connectedAt: new Date(),
            needsReconnect: false,
          },
        },
        { upsert: true },
      );
      return this.returnUrl("connected");
    } catch (err) {
      this.logger.error(`Fortnox connect failed: ${(err as Error).message}`);
      return this.returnUrl("error", (err as Error).message);
    }
  }

  async disconnect(user: AuthUser) {
    const companyId = this.companyOf(user);
    const conn = await this.connectionModel.findOne({ companyId }).exec();
    if (!conn) return { connected: false };
    const cfg = this.config();
    if (cfg && conn.refreshTokenEnc) {
      // Best effort: the local link is removed even if Fortnox is unreachable.
      try {
        await fetch(REVOKE_URL, {
          method: "POST",
          headers: {
            Authorization: this.basicAuth(cfg),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            token: decryptToken(conn.refreshTokenEnc),
            token_type_hint: "refresh_token",
          }).toString(),
        });
      } catch (err) {
        this.logger.warn(`Fortnox revoke failed: ${(err as Error).message}`);
      }
    }
    await this.connectionModel.deleteOne({ companyId }).exec();
    return { connected: false };
  }

  // ---- Tokens --------------------------------------------------------------

  private basicAuth(cfg: { clientId: string; clientSecret: string }) {
    return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  }

  private tokenFields(tokens: TokenResponse) {
    return {
      accessTokenEnc: encryptToken(tokens.access_token),
      refreshTokenEnc: encryptToken(tokens.refresh_token),
      // Refresh a minute early.
      accessTokenExpiresAt: new Date(
        Date.now() +
          Math.max(60, Number(tokens.expires_in) || 3600) * 1000 -
          60_000,
      ),
    };
  }

  private async tokenRequest(
    cfg: { clientId: string; clientSecret: string },
    body: Record<string, string>,
  ): Promise<TokenResponse> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: this.basicAuth(cfg),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
    });
    const data = (await res
      .json()
      .catch(() => ({}))) as Partial<TokenResponse> & {
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token || !data.refresh_token) {
      throw new FortnoxApiError(
        data.error_description ||
          data.error ||
          `Fortnox token request failed (${res.status})`,
        res.status,
      );
    }
    return data as TokenResponse;
  }

  private async accessToken(
    companyId: string,
    forceRefresh = false,
  ): Promise<string> {
    const conn = await this.connectionModel
      .findOne({ companyId })
      .lean()
      .exec();
    if (!conn || conn.needsReconnect) {
      throw new BadRequestException("Fortnox is not connected");
    }
    const fresh =
      conn.accessTokenExpiresAt &&
      new Date(conn.accessTokenExpiresAt).getTime() > Date.now();
    if (fresh && !forceRefresh) return decryptToken(conn.accessTokenEnc);

    const running = this.refreshing.get(companyId);
    if (running) return running;
    const job = this.refresh(companyId, conn.refreshTokenEnc).finally(() =>
      this.refreshing.delete(companyId),
    );
    this.refreshing.set(companyId, job);
    return job;
  }

  private async refresh(
    companyId: string,
    refreshTokenEnc: string,
  ): Promise<string> {
    const cfg = this.requireConfig();
    try {
      const tokens = await this.tokenRequest(cfg, {
        grant_type: "refresh_token",
        refresh_token: decryptToken(refreshTokenEnc),
      });
      // Store the rotated refresh token at once — the old one is spent.
      await this.connectionModel.updateOne(
        { companyId },
        { $set: this.tokenFields(tokens) },
      );
      return tokens.access_token;
    } catch (err) {
      if (
        err instanceof FortnoxApiError &&
        err.status >= 400 &&
        err.status < 500
      ) {
        await this.connectionModel.updateOne(
          { companyId },
          { $set: { needsReconnect: true } },
        );
        throw new BadRequestException("Fortnox needs to be connected again");
      }
      throw err;
    }
  }

  // ---- API calls -----------------------------------------------------------

  private async throttle(companyId: string) {
    const wait =
      (this.lastCall.get(companyId) || 0) + MIN_CALL_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall.set(companyId, Date.now());
  }

  private async fetchJson(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      const info = (data.ErrorInformation ||
        data.errorInformation ||
        {}) as Record<string, unknown>;
      const msg =
        str(info.message) ||
        str(info.Message) ||
        str(data.message) ||
        `HTTP ${res.status}`;
      throw new FortnoxApiError(msg, res.status);
    }
    return data;
  }

  private async api(
    companyId: string,
    method: string,
    path: string,
    body?: unknown,
  ) {
    await this.throttle(companyId);
    try {
      return await this.fetchJson(
        method,
        path,
        await this.accessToken(companyId),
        body,
      );
    } catch (err) {
      if (err instanceof FortnoxApiError && err.status === 401) {
        await this.throttle(companyId);
        return this.fetchJson(
          method,
          path,
          await this.accessToken(companyId, true),
          body,
        );
      }
      throw err;
    }
  }

  private toHttpError(err: unknown) {
    if (err instanceof FortnoxApiError)
      return new BadRequestException(`Fortnox: ${err.message}`);
    return err;
  }

  // ---- Invoices ------------------------------------------------------------

  private async findOrCreateCustomer(
    companyId: string,
    invoice: InvoiceLike,
    client: ClientLike | null,
  ): Promise<{ number: string; name: string }> {
    type Cust = { CustomerNumber: string; Name: string };
    const org = customerOrgNumber(invoice, client);
    if (org) {
      const res = (await this.api(
        companyId,
        "GET",
        `/customers?organisationnumber=${encodeURIComponent(org)}`,
      )) as { Customers?: Cust[] };
      const hit = res.Customers?.[0];
      if (hit) return { number: hit.CustomerNumber, name: hit.Name };
    }
    const name = String(invoice.companyName || "").trim();
    if (name) {
      const res = (await this.api(
        companyId,
        "GET",
        `/customers?name=${encodeURIComponent(name)}`,
      )) as { Customers?: Cust[] };
      const hit = (res.Customers || []).find(
        (c) =>
          String(c.Name || "")
            .trim()
            .toLowerCase() === name.toLowerCase(),
      );
      if (hit) return { number: hit.CustomerNumber, name: hit.Name };
    }
    const created = (await this.api(companyId, "POST", "/customers", {
      Customer: buildFortnoxCustomer(invoice, client),
    })) as { Customer?: Cust };
    if (!created.Customer?.CustomerNumber) {
      throw new FortnoxApiError("Customer was not created", 500);
    }
    return {
      number: created.Customer.CustomerNumber,
      name: created.Customer.Name,
    };
  }

  private async findClient(
    companyId: string,
    invoice: InvoiceLike,
  ): Promise<ClientLike | null> {
    const or: Record<string, string>[] = [];
    if (invoice.customerNumber)
      or.push({ customerNumber: invoice.customerNumber });
    if (invoice.companyName) or.push({ companyName: invoice.companyName });
    if (!or.length) return null;
    return (await this.clientModel
      .findOne({ companyId, $or: or })
      .lean()
      .exec()) as ClientLike | null;
  }

  async pushInvoice(id: string, user: AuthUser) {
    const companyId = this.companyOf(user);
    const doc = await this.invoicesService.findOne(id, user);
    if ([InvoiceStatus.Draft, InvoiceStatus.Cancelled].includes(doc.status)) {
      throw new BadRequestException(
        "Only a booked invoice can be sent to Fortnox",
      );
    }
    if (doc.fortnoxDocumentNumber) return this.invoiceFortnoxState(doc);

    // Claim the invoice so two clicks can't create two Fortnox invoices.
    const claimed = await this.invoiceModel.updateOne(
      {
        _id: doc._id,
        fortnoxDocumentNumber: { $in: [null, ""] },
        $or: [
          { fortnoxPushingAt: null },
          { fortnoxPushingAt: { $lt: new Date(Date.now() - PUSH_CLAIM_MS) } },
        ],
      },
      { $set: { fortnoxPushingAt: new Date() } },
    );
    if (!claimed.modifiedCount) {
      throw new ConflictException(
        "The invoice is already being sent to Fortnox",
      );
    }

    const invoice = doc.toObject() as unknown as InvoiceLike & {
      creditOfId?: string | null;
      total?: number;
    };
    const warnings: string[] = [];
    try {
      let documentNumber: string;
      if (invoice.creditOfId) {
        documentNumber = await this.pushCreditNote(
          companyId,
          invoice,
          warnings,
        );
      } else {
        const client = await this.findClient(companyId, invoice);
        const customer = await this.findOrCreateCustomer(
          companyId,
          invoice,
          client,
        );
        const company = await this.companyModel
          .findById(companyId)
          .select("currency")
          .lean()
          .exec();
        const created = (await this.api(
          companyId,
          "POST",
          "/invoices",
          buildFortnoxInvoice(invoice, customer.number, {
            currency: company?.currency || "SEK",
          }),
        )) as { Invoice?: { DocumentNumber?: string | number } };
        documentNumber = String(created.Invoice?.DocumentNumber || "");
        if (!documentNumber)
          throw new FortnoxApiError("No document number returned", 500);

        const reduction = buildFortnoxTaxReduction(
          invoice,
          documentNumber,
          customer.name,
        );
        if (reduction) {
          try {
            await this.api(companyId, "POST", "/taxreductions", reduction);
          } catch (err) {
            warnings.push(`taxreduction: ${(err as Error).message}`);
          }
        } else if (invoice.rotEnabled) {
          warnings.push("taxreduction: complete in Fortnox");
        }
      }

      await this.invoiceModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            fortnoxStatus: "sent",
            fortnoxDocumentNumber: documentNumber,
            fortnoxSentAt: new Date(),
            fortnoxError: null,
            fortnoxPushingAt: null,
          },
        },
      );
    } catch (err) {
      await this.invoiceModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            fortnoxStatus: "error",
            fortnoxError: String((err as Error).message || "error").slice(
              0,
              500,
            ),
            fortnoxPushingAt: null,
          },
        },
      );
      throw this.toHttpError(err);
    }
    const fresh = await this.invoiceModel.findById(doc._id).lean().exec();
    return { ...this.invoiceFortnoxState(fresh), warnings };
  }

  private async pushCreditNote(
    companyId: string,
    invoice: InvoiceLike & { creditOfId?: string | null; total?: number },
    warnings: string[],
  ): Promise<string> {
    const source = await this.invoiceModel
      .findOne({ _id: invoice.creditOfId, companyId })
      .lean()
      .exec();
    if (!source?.fortnoxDocumentNumber) {
      throw new BadRequestException(
        "Send the original invoice to Fortnox first",
      );
    }
    const full =
      Math.abs(
        Math.abs(Number(invoice.total) || 0) -
          Math.abs(Number(source.total) || 0),
      ) < 0.01;
    if (full) {
      // Fortnox's own full credit of the original invoice.
      const res = (await this.api(
        companyId,
        "PUT",
        `/invoices/${encodeURIComponent(source.fortnoxDocumentNumber)}/credit`,
      )) as { Invoice?: { CreditInvoiceReference?: string | number } };
      const ref = String(res.Invoice?.CreditInvoiceReference || "");
      if (!ref || ref === "0")
        throw new FortnoxApiError("No credit invoice number returned", 500);
      return ref;
    }
    // Partial credit: a new invoice with the negated rows, pointing at the
    // original.
    const original = (await this.api(
      companyId,
      "GET",
      `/invoices/${encodeURIComponent(source.fortnoxDocumentNumber)}`,
    )) as { Invoice?: { CustomerNumber?: string } };
    const customerNumber = String(original.Invoice?.CustomerNumber || "");
    if (!customerNumber)
      throw new FortnoxApiError("Original invoice has no customer", 500);
    const created = (await this.api(
      companyId,
      "POST",
      "/invoices",
      buildFortnoxInvoice(invoice, customerNumber, {
        creditReference: source.fortnoxDocumentNumber,
      }),
    )) as { Invoice?: { DocumentNumber?: string | number } };
    if (invoice.rotEnabled) warnings.push("taxreduction: complete in Fortnox");
    return String(created.Invoice?.DocumentNumber || "");
  }

  private invoiceFortnoxState(doc: Partial<Invoice> | null) {
    return {
      fortnoxStatus: doc?.fortnoxStatus || null,
      fortnoxDocumentNumber: doc?.fortnoxDocumentNumber || null,
      fortnoxSentAt: doc?.fortnoxSentAt || null,
      fortnoxError: doc?.fortnoxError || null,
    };
  }

  // ---- Lön -----------------------------------------------------------------

  async pushPayroll(
    from: string,
    to: string,
    user: AuthUser,
    userIds: string[] = [],
    force = false,
  ) {
    const companyId = this.companyOf(user);
    // Fails fast before building the basis.
    await this.accessToken(companyId);

    const basis = await this.wageBasisService.buildBasis(
      from,
      to,
      user,
      userIds,
    );
    const settings = await this.wageBasisService.getSettings(user);
    const workers = basis.workers.map((w) => ({
      userId: w.userId,
      name: w.name,
      items: w.items,
      employeeId: w.payrollEmployeeId,
    }));
    const candidateIds = workers
      .filter((w) => w.employeeId && w.items.length)
      .map((w) => w.userId);

    if (!force && candidateIds.length) {
      const already = await this.exportModel
        .findOne({
          companyId,
          from,
          to,
          format: "fortnox",
          userIds: { $in: candidateIds },
        })
        .lean()
        .exec();
      if (already) {
        throw new ConflictException({
          statusCode: 409,
          code: "already_sent",
          message: "This period is already sent to Fortnox",
        });
      }
    }

    const tx = buildFortnoxWageTransactions({
      companyName: "",
      orgNumber: "",
      generatedAt: new Date(),
      workers,
      salaryCodes: settings.salaryCodes,
      absenceCodes: settings.absenceCodes,
    });

    const failed: Array<{
      employeeId: string;
      date: string;
      code: string;
      message: string;
    }> = [];
    const okEmployees = new Set<string>();
    let salaryCount = 0;
    let absenceCount = 0;

    const send = async (
      path: string,
      body: Record<string, Record<string, unknown>>,
    ) => {
      const row = Object.values(body)[0];
      try {
        await this.api(companyId, "POST", path, body);
        okEmployees.add(str(row.EmployeeId));
        return true;
      } catch (err) {
        if (!(err instanceof FortnoxApiError)) throw err;
        failed.push({
          employeeId: str(row.EmployeeId),
          date: str(row.Date),
          code: str(row.SalaryCode) || str(row.CauseCode),
          message: err.message,
        });
        return false;
      }
    };
    for (const body of tx.salary)
      if (await send("/salarytransactions", body)) salaryCount++;
    for (const body of tx.absence)
      if (await send("/absencetransactions", body)) absenceCount++;

    const sentIds = workers
      .filter((w) => okEmployees.has(String(w.employeeId || "").trim()))
      .map((w) => w.userId);
    if (sentIds.length) {
      await this.exportModel.create({
        companyId,
        from,
        to,
        userIds: sentIds,
        format: "fortnox",
        exportedByUserId: user.userId || null,
      });
    }
    return { salaryCount, absenceCount, failed, skipped: tx.skipped };
  }

  // ---- Supplier invoices (Fortnox → project costs) ------------------------

  private hasScope(scope: string | undefined | null, wanted: string) {
    return String(scope || "")
      .split(/\s+/)
      .includes(wanted);
  }

  async syncSupplierInvoices(user: AuthUser) {
    const companyId = this.companyOf(user);
    try {
      return await this.syncCompanySupplierInvoices(companyId);
    } catch (err) {
      throw this.toHttpError(err);
    }
  }

  // Paid supplier invoices modified since the last run → our purchase
  // invoices (source "fortnox"), each imported once by its löpnummer and
  // put on the project whose littera/name matches the Fortnox project code.
  async syncCompanySupplierInvoices(companyId: string) {
    const conn = await this.connectionModel
      .findOne({ companyId })
      .lean()
      .exec();
    if (!conn || conn.needsReconnect) {
      throw new BadRequestException("Fortnox is not connected");
    }
    if (!this.hasScope(conn.scope, SUPPLIER_SCOPE)) {
      throw new BadRequestException(
        "Reconnect Fortnox to allow reading supplier invoices",
      );
    }
    const startedAt = new Date();
    const since = conn.supplierSyncAt
      ? new Date(conn.supplierSyncAt)
      : new Date(Date.now() - 365 * 86400000);
    const stamp = since.toISOString().slice(0, 16).replace("T", " ");

    const listed: FortnoxSupplierInvoice[] = [];
    for (let page = 1, pages = 1; page <= pages && page <= 50; page += 1) {
      const q = new URLSearchParams({
        filter: "fullypaid",
        lastmodified: stamp,
        limit: "500",
        page: String(page),
      });
      const data = (await this.api(
        companyId,
        "GET",
        `/supplierinvoices?${q.toString()}`,
      )) as {
        SupplierInvoices?: FortnoxSupplierInvoice[];
        MetaInformation?: Record<string, unknown>;
      };
      listed.push(...(data.SupplierInvoices || []));
      pages = Number(data.MetaInformation?.["@TotalPages"]) || 1;
    }

    const numbers = listed
      .filter((fx) => !fx.Cancelled && str(fx.GivenNumber))
      .map((fx) => str(fx.GivenNumber));
    const known = new Set(
      (
        await this.supplierInvoiceModel
          .find({ companyId, fortnoxGivenNumber: { $in: numbers } })
          .select("fortnoxGivenNumber")
          .lean()
          .exec()
      ).map((d) => String(d.fortnoxGivenNumber)),
    );
    const projects = (
      await this.projectModel
        .find({ companyId })
        .select("_id name littera")
        .lean()
        .exec()
    ).map((p) => ({ id: String(p._id), name: p.name, littera: p.littera }));

    let imported = 0;
    let linked = 0;
    for (const given of numbers.filter((n) => !known.has(n))) {
      const detail = (await this.api(
        companyId,
        "GET",
        `/supplierinvoices/${encodeURIComponent(given)}`,
      )) as { SupplierInvoice?: FortnoxSupplierInvoice };
      if (!detail.SupplierInvoice || detail.SupplierInvoice.Cancelled) continue;
      const fields = mapSupplierInvoice(detail.SupplierInvoice, projects);
      try {
        await this.supplierInvoiceModel.create({ companyId, ...fields });
        imported += 1;
        if (fields.projectId) linked += 1;
      } catch (err) {
        // Duplicate from a parallel run: already imported.
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    await this.connectionModel
      .updateOne({ companyId }, { $set: { supplierSyncAt: startedAt } })
      .exec();
    return { imported, linked, unlinked: imported - linked };
  }

  // Nightly: every company that allowed supplier invoices.
  @Cron("0 30 3 * * *")
  async nightlySupplierInvoiceSync() {
    const conns = await this.connectionModel
      .find({ needsReconnect: { $ne: true }, scope: /supplierinvoice/ })
      .select("companyId")
      .lean()
      .exec();
    for (const c of conns) {
      try {
        await this.syncCompanySupplierInvoices(String(c.companyId));
      } catch (err) {
        this.logger.warn(
          `Fortnox supplier sync ${c.companyId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
