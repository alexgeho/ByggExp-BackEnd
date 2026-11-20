import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ImapFlow } from "imapflow";
import { simpleParser, AddressObject } from "mailparser";
import { InboundInvoicesService } from "./inbound-invoices.service";
import { codesFromHeaders, handledFlag } from "./inbound-mailbox";

const addressText = (a?: AddressObject | AddressObject[]) =>
  (Array.isArray(a) ? a : a ? [a] : []).map((x) => x.text || "");

// Reads the catch-all mailbox (faktura@byggexp.se) every 2 minutes. Each mail
// sent to faktura+<code>@… becomes draft supplier invoices of the company
// owning <code> (same path as the old e-mail worker → InboundInvoicesService).
// Off until INBOUND_IMAP_HOST / _USER / _PASS are set.
@Injectable()
export class InboundMailboxService {
  private readonly logger = new Logger(InboundMailboxService.name);
  private running = false;

  constructor(private readonly inbound: InboundInvoicesService) {}

  private config() {
    const host = process.env.INBOUND_IMAP_HOST || "";
    const user = process.env.INBOUND_IMAP_USER || "";
    const pass = process.env.INBOUND_IMAP_PASS || "";
    if (!host || !user || !pass) return null;
    const port = Number(process.env.INBOUND_IMAP_PORT) || 993;
    return { host, user, pass, port };
  }

  @Cron("0 */2 * * * *")
  async poll() {
    const cfg = this.config();
    if (!cfg || this.running) return;
    this.running = true;
    const flag = handledFlag();
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 993,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });
    const timer = setTimeout(() => client.close(), 110_000);
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Only recent mail this environment hasn't handled yet.
        const since = new Date(Date.now() - 14 * 864e5);
        const uids =
          (await client.search({ since, unKeyword: flag }, { uid: true })) ||
          [];
        for (const uid of uids.slice(0, 50)) {
          const msg = await client.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (msg && msg.source) await this.handle(msg.source);
          await client.messageFlagsAdd(String(uid), [flag], { uid: true });
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      this.logger.warn(
        `Invoice mailbox read failed: ${(err as Error)?.message || err}`,
      );
      client.close();
    } finally {
      clearTimeout(timer);
      this.running = false;
    }
  }

  private async handle(source: Buffer) {
    const mail = await simpleParser(source);
    const headerValues = [
      ...addressText(mail.to),
      ...addressText(mail.cc),
      // Raw header lines keep every Delivered-To (headers.get keeps one).
      ...(mail.headerLines || [])
        .filter((l) =>
          ["delivered-to", "x-original-to", "envelope-to"].includes(l.key),
        )
        .map((l) => l.line),
    ];
    const files = (mail.attachments || []).map((a) => ({
      buffer: a.content,
      mimetype: a.contentType,
      originalname: a.filename || "faktura",
    }));
    for (const code of codesFromHeaders(headerValues)) {
      const companyId = await this.inbound.companyIdForCode(code);
      if (!companyId) continue;
      const res = await this.inbound.ingest(companyId, files);
      this.logger.log(
        `Invoice mail for company ${companyId}: ${res.created} draft(s), ${res.skipped} skipped`,
      );
      return; // one company per mail
    }
  }
}
