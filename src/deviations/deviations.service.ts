import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import { unlink } from "fs/promises";
import { Model } from "mongoose";
import { join } from "path";
import {
  Checklist,
  ChecklistDocument,
} from "../checklists/schemas/checklist.schema";
import { cronsDisabled } from "../common/cron.util";
import { languageCode } from "../common/language";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { resolveModules } from "../company/modules";
import { DagbokDocument, DagbokEntry } from "../dagbok/schemas/dagbok.schema";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { NotificationsService } from "../notifications/notifications.service";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import {
  allowedFields,
  buildCsv,
  buildListFilter,
  canAccessProject,
  canManage,
  canTransition,
  categoryFromChecklist,
  DeviationActor,
  DeviationListQuery,
  diffFields,
  editScope,
  ExportRow,
  isCompanyWide,
  isOverdue,
  MANAGER_FIELDS,
  parseDueDate,
  ProjectMembers,
  pushLang,
  pushText,
  ReportLang,
  reportLangForCountry,
  startOfDayUtc,
} from "./deviation.logic";
import {
  CloseDeviationDto,
  CreateDeviationDto,
  ReopenDeviationDto,
  UpdateDeviationDto,
} from "./dto/deviation.dto";
import {
  Deviation,
  DeviationCategory,
  DeviationCounter,
  DeviationCounterDocument,
  DeviationDocument,
  DeviationHistoryEntry,
  DeviationSeverity,
  DeviationStatus,
} from "./schemas/deviation.schema";
import { buildDeviationReportHtml } from "./templates/deviation-report.template";

export type DeviationAuthUser = DeviationActor & { email?: string };

export type UploadedDeviationPhoto = { filename: string; originalname: string };

type ProjectLean = ProjectMembers & {
  _id: unknown;
  name?: string;
  companyId?: string;
};

type NotifyKind = "assigned" | "reported" | "due_soon" | "overdue";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DeviationsService {
  private readonly logger = new Logger(DeviationsService.name);
  private processingReminders = false;

  constructor(
    @InjectModel(Deviation.name)
    private readonly deviations: Model<DeviationDocument>,
    @InjectModel(DeviationCounter.name)
    private readonly counters: Model<DeviationCounterDocument>,
    @InjectModel(Project.name)
    private readonly projects: Model<ProjectDocument>,
    @InjectModel(Company.name)
    private readonly companies: Model<CompanyDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Checklist.name)
    private readonly checklists: Model<ChecklistDocument>,
    @InjectModel(DagbokEntry.name)
    private readonly dagbok: Model<DagbokDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- access ----------

  private companyOf(user: DeviationAuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return String(user.companyId);
  }

  // Avvik is a package module (Kontroll på jobben + Full): a company without
  // it gets 403, like payroll.
  private async loadCompany(user: DeviationAuthUser) {
    const companyId = this.companyOf(user);
    const company = await this.companies
      .findById(companyId)
      .select("name orgNumber country plan moduleOverrides maxUsers")
      .lean()
      .exec();
    if (!company || !resolveModules(company).enabled.includes("avvik")) {
      throw new ForbiddenException("Deviations are not included in your plan");
    }
    return company;
  }

  private async loadProject(
    projectId: string,
    user: DeviationAuthUser,
  ): Promise<ProjectLean> {
    const companyId = this.companyOf(user);
    const project = (await this.projects
      .findById(projectId)
      .select("name companyId ownerId projectManagerId projectAdmins workers")
      .lean()
      .exec()) as ProjectLean | null;
    if (!project || String(project.companyId) !== companyId) {
      throw new NotFoundException("Project not found");
    }
    if (!canAccessProject(user, project)) {
      throw new ForbiddenException("You do not have access to this project");
    }
    return project;
  }

  private async loadDeviation(id: string, user: DeviationAuthUser) {
    const companyId = this.companyOf(user);
    const doc = await this.deviations.findById(id).exec();
    if (!doc || String(doc.companyId) !== companyId) {
      throw new NotFoundException("Deviation not found");
    }
    const project = await this.loadProject(String(doc.projectId), user);
    return { doc, project };
  }

  // Project ids the actor may see; null = whole company.
  private async projectScope(
    user: DeviationAuthUser,
  ): Promise<string[] | null> {
    if (isCompanyWide(user)) return null;
    const uid = String(user.userId || "");
    if (!uid) return [];
    const rows = await this.projects
      .find({
        companyId: this.companyOf(user),
        $or: [
          { ownerId: uid },
          { projectManagerId: uid },
          { projectAdmins: uid },
          { workers: uid },
        ],
      })
      .select("_id")
      .lean()
      .exec();
    return rows.map((p) => String(p._id));
  }

  private async userName(userId?: string | null, fallback = "") {
    if (!userId) return fallback;
    const u = await this.users
      .findById(userId)
      .select("name email")
      .lean()
      .exec();
    return u?.name || u?.email || fallback;
  }

  private async resolveResponsible(
    userId: string | null | undefined,
    companyId: string,
  ): Promise<{ id: string | null; name: string }> {
    if (!userId) return { id: null, name: "" };
    const u = await this.users
      .findById(userId)
      .select("name email companyId")
      .lean()
      .exec();
    if (!u || String(u.companyId) !== companyId) {
      throw new BadRequestException(
        "Responsible user not found in your company",
      );
    }
    return { id: String(u._id), name: u.name || u.email || "" };
  }

  private async nextNumber(companyId: string): Promise<number> {
    const counter = await this.counters
      .findOneAndUpdate(
        { companyId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
    return Number(counter?.seq || 1);
  }

  // What the client gets: the stored deviation + derived flags, so the app
  // and admin don't re-implement the rules.
  private view(
    doc: DeviationDocument | Record<string, unknown>,
    user: DeviationAuthUser,
    project: ProjectLean | null,
    now = new Date(),
  ) {
    const plain = (
      typeof (doc as DeviationDocument).toObject === "function"
        ? (doc as DeviationDocument).toObject()
        : doc
    ) as Deviation & { _id: unknown };
    const scope = project ? editScope(user, project, plain) : "none";
    return {
      ...plain,
      projectName: project?.name || "",
      overdue: isOverdue(plain, now),
      canManage: project ? canManage(user, project) : false,
      editableFields: allowedFields(scope),
    };
  }

  // ---------- list / read ----------

  async list(user: DeviationAuthUser, query: DeviationListQuery = {}) {
    await this.loadCompany(user);
    const companyId = this.companyOf(user);
    const scope = await this.projectScope(user);
    const filter = buildListFilter(companyId, query, scope, user);
    const docs = await this.deviations
      .find(filter)
      .select("-history")
      .sort({ number: -1 })
      .lean()
      .exec();
    const projects = await this.projectsById(
      docs.map((d) => String(d.projectId)),
    );
    return docs.map((d) =>
      this.view(d as never, user, projects.get(String(d.projectId)) || null),
    );
  }

  async summary(user: DeviationAuthUser, projectId?: string) {
    await this.loadCompany(user);
    const companyId = this.companyOf(user);
    const scope = await this.projectScope(user);
    const base = buildListFilter(companyId, { projectId }, scope, user);
    const now = new Date();
    const [open, inProgress, closed, overdue] = await Promise.all([
      this.deviations
        .countDocuments({ ...base, status: DeviationStatus.Open })
        .exec(),
      this.deviations
        .countDocuments({ ...base, status: DeviationStatus.InProgress })
        .exec(),
      this.deviations
        .countDocuments({ ...base, status: DeviationStatus.Closed })
        .exec(),
      this.deviations
        .countDocuments(
          buildListFilter(
            companyId,
            { projectId, overdue: true },
            scope,
            user,
            now,
          ),
        )
        .exec(),
    ]);
    return { open, inProgress, closed, overdue };
  }

  async findOne(id: string, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const { doc, project } = await this.loadDeviation(id, user);
    return this.view(doc, user, project);
  }

  private async projectsById(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const rows = unique.length
      ? ((await this.projects
          .find({ _id: { $in: unique } })
          .select(
            "name companyId ownerId projectManagerId projectAdmins workers",
          )
          .lean()
          .exec()) as ProjectLean[])
      : [];
    return new Map(rows.map((p) => [String(p._id), p]));
  }

  // People who can be made responsible: the project's members + company admins.
  async responsibleOptions(user: DeviationAuthUser, projectId: string) {
    await this.loadCompany(user);
    const project = await this.loadProject(projectId, user);
    const companyId = this.companyOf(user);
    const memberIds = [
      project.ownerId,
      project.projectManagerId,
      ...(project.projectAdmins || []),
      ...(project.workers || []),
    ]
      .map((v) => String(v ?? ""))
      .filter(Boolean);
    const rows = await this.users
      .find({
        companyId,
        $or: [{ _id: { $in: memberIds } }, { role: UserRole.CompanyAdmin }],
      })
      .select("name email role")
      .sort({ name: 1 })
      .lean()
      .exec();
    return rows.map((u) => ({
      _id: String(u._id),
      name: u.name || u.email || "",
      role: u.role,
    }));
  }

  // ---------- prefill from a checklist remark / dagbok avvik ----------

  async prefill(
    user: DeviationAuthUser,
    q: { checklistId?: string; itemIndex?: string | number; dagbokId?: string },
  ) {
    await this.loadCompany(user);
    const companyId = this.companyOf(user);
    if (q.checklistId) {
      const cl = await this.checklists.findById(q.checklistId).lean().exec();
      if (!cl || String(cl.companyId) !== companyId) {
        throw new NotFoundException("Checklist not found");
      }
      await this.loadProject(String(cl.projectId), user);
      const index = Number(q.itemIndex);
      const item = Number.isInteger(index) ? cl.items?.[index] : undefined;
      if (!item) throw new NotFoundException("Checklist point not found");
      const description = [item.comment, item.reference]
        .filter((s) => s && String(s).trim())
        .join("\n");
      return {
        projectId: String(cl.projectId),
        title: (item.text || cl.title || "").slice(0, 200),
        description,
        category: categoryFromChecklist(cl.category),
        severity: DeviationSeverity.Medium,
        location: "",
        correctiveAction: item.action || "",
        source: { type: "checklist", id: String(cl._id), itemIndex: index },
      };
    }
    if (q.dagbokId) {
      const entry = await this.dagbok.findById(q.dagbokId).lean().exec();
      if (!entry || String(entry.companyId) !== companyId) {
        throw new NotFoundException("Dagbok entry not found");
      }
      await this.loadProject(String(entry.projectId), user);
      const text = String(entry.deviations || "").trim();
      const firstLine = text.split(/\r?\n/)[0] || "";
      return {
        projectId: String(entry.projectId),
        title: firstLine.slice(0, 200),
        description: text,
        category: DeviationCategory.Hms,
        severity: DeviationSeverity.Medium,
        location: "",
        correctiveAction: "",
        source: { type: "dagbok", id: String(entry._id) },
      };
    }
    throw new BadRequestException("checklistId or dagbokId is required");
  }

  // Due date from the client: empty → null, invalid → 400 (never silently
  // dropped).
  private dueDateOf(value: unknown): Date | null {
    const parsed = parseDueDate(value);
    if (parsed === undefined) {
      throw new BadRequestException("dueDate must be YYYY-MM-DD");
    }
    return parsed;
  }

  // The checklist / dagbok entry a deviation was made from must be in the
  // caller's company and on the same project.
  private async assertSource(
    source: CreateDeviationDto["source"],
    companyId: string,
    projectId: string,
  ) {
    if (!source) return null;
    type SourceDoc = { companyId: string; projectId: string };
    const model: Model<SourceDoc> =
      source.type === "checklist"
        ? (this.checklists as unknown as Model<SourceDoc>)
        : (this.dagbok as unknown as Model<SourceDoc>);
    const found = await model
      .findById(source.id)
      .select("companyId projectId")
      .lean()
      .exec();
    if (
      !found ||
      String(found.companyId) !== companyId ||
      String(found.projectId) !== String(projectId)
    ) {
      throw new BadRequestException("Source not found");
    }
    return {
      type: source.type,
      id: source.id,
      itemIndex: source.itemIndex ?? null,
    };
  }

  // ---------- write ----------

  private historyEntry(
    user: DeviationAuthUser,
    userName: string,
    action: DeviationHistoryEntry["action"],
    extra: Partial<DeviationHistoryEntry> = {},
  ): DeviationHistoryEntry {
    return {
      at: new Date(),
      userId: user.userId ? String(user.userId) : null,
      userName,
      action,
      changes: [],
      comment: "",
      ...extra,
    };
  }

  async create(dto: CreateDeviationDto, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const companyId = this.companyOf(user);
    const project = await this.loadProject(dto.projectId, user);
    const manager = canManage(user, project);
    const reporterName = await this.userName(user.userId, user.email || "");
    const responsible = manager
      ? await this.resolveResponsible(dto.responsibleUserId, companyId)
      : { id: null, name: "" };
    const source = await this.assertSource(
      dto.source,
      companyId,
      String(project._id),
    );
    const dueDate = manager ? this.dueDateOf(dto.dueDate) : null;
    const number = await this.nextNumber(companyId);

    const doc = await this.deviations.create({
      companyId,
      projectId: String(project._id),
      number,
      title: dto.title.trim(),
      description: (dto.description || "").trim(),
      category: dto.category || DeviationCategory.Hms,
      severity: dto.severity || DeviationSeverity.Medium,
      location: (dto.location || "").trim(),
      photos: [],
      reportedByUserId: user.userId ? String(user.userId) : null,
      reportedByName: reporterName,
      reportedAt: new Date(),
      responsibleUserId: responsible.id,
      responsibleName: responsible.name,
      dueDate,
      cause: (dto.cause || "").trim(),
      correctiveAction: (dto.correctiveAction || "").trim(),
      status: DeviationStatus.Open,
      source,
      history: [this.historyEntry(user, reporterName, "created")],
      createdByUserId: user.userId ? String(user.userId) : null,
    });

    const notified = new Set<string>();
    if (responsible.id && responsible.id !== String(user.userId)) {
      await this.notify([responsible.id], "assigned", doc, project);
      notified.add(responsible.id);
    }
    // «New deviation» to the managers is off until the app release that can
    // switch it off (DEVIATION_NEW_REPORT_PUSH=true turns it on).
    if (process.env.DEVIATION_NEW_REPORT_PUSH === "true") {
      const managers = (await this.managerIds(project, companyId)).filter(
        (id) => id !== String(user.userId) && !notified.has(id),
      );
      await this.notify(managers, "reported", doc, project);
    }

    return this.view(doc, user, project);
  }

  async update(id: string, dto: UpdateDeviationDto, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const companyId = this.companyOf(user);
    const { doc, project } = await this.loadDeviation(id, user);
    const scope = editScope(user, project, doc);
    const allowed = allowedFields(scope);
    const provided = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    const before = doc.toObject() as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of provided) {
      const value = (dto as Record<string, unknown>)[key];
      if (key === "dueDate") next.dueDate = this.dueDateOf(value);
      else if (key === "responsibleUserId")
        next.responsibleUserId = value || null;
      else if (typeof value === "string") next[key] = value.trim();
      else next[key] = value;
    }
    const changes = diffFields(before, next, MANAGER_FIELDS);
    const forbidden = changes.filter((c) => !allowed.includes(c.field));
    if (forbidden.length) {
      throw new ForbiddenException(
        `You cannot change: ${forbidden.map((c) => c.field).join(", ")}`,
      );
    }
    if (!changes.length) return this.view(doc, user, project);
    if (doc.status === DeviationStatus.Closed) {
      // Managers may still correct text on a closed deviation, not its status.
      if (changes.some((c) => c.field === "status")) {
        throw new BadRequestException("Reopen the deviation first");
      }
    }
    const statusChange = changes.find((c) => c.field === "status");
    if (
      statusChange &&
      (!canTransition(String(statusChange.from), String(statusChange.to)) ||
        statusChange.to === DeviationStatus.Closed)
    ) {
      throw new BadRequestException(
        `Status cannot go from ${String(statusChange.from)} to ${String(statusChange.to)}`,
      );
    }

    let newResponsible: string | null = null;
    for (const c of changes) {
      if (c.field === "responsibleUserId") {
        const r = await this.resolveResponsible(
          next.responsibleUserId as string,
          companyId,
        );
        doc.responsibleUserId = r.id;
        doc.responsibleName = r.name;
        newResponsible = r.id;
        doc.dueSoonNotifiedAt = null;
        doc.overdueNotifiedAt = null;
      } else if (c.field === "dueDate") {
        doc.dueDate = next.dueDate as Date | null;
        doc.dueSoonNotifiedAt = null;
        doc.overdueNotifiedAt = null;
      } else {
        (doc as unknown as Record<string, unknown>)[c.field] = next[c.field];
      }
    }
    const actorName = await this.userName(user.userId, user.email || "");
    const historyChanges = changes.map((c) =>
      c.field === "responsibleUserId"
        ? {
            field: "responsible",
            from: (before.responsibleName as string) || "",
            to: doc.responsibleName,
          }
        : c,
    );
    doc.history.push(
      this.historyEntry(
        user,
        actorName,
        statusChange && changes.length === 1 ? "status" : "updated",
        {
          changes: historyChanges,
        },
      ),
    );
    await doc.save();

    if (newResponsible && newResponsible !== String(user.userId)) {
      await this.notify([newResponsible], "assigned", doc, project);
    }
    return this.view(doc, user, project);
  }

  async close(id: string, dto: CloseDeviationDto, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const { doc, project } = await this.loadDeviation(id, user);
    if (!canManage(user, project)) {
      throw new ForbiddenException(
        "Only an admin or project admin can close a deviation",
      );
    }
    if (doc.status === DeviationStatus.Closed) {
      throw new BadRequestException("The deviation is already closed");
    }
    const comment = (dto.closingComment || "").trim();
    if (!comment)
      throw new BadRequestException("A closing comment is required");
    const actorName = await this.userName(user.userId, user.email || "");
    const changes: { field: string; from: unknown; to: unknown }[] = [
      { field: "status", from: doc.status, to: DeviationStatus.Closed },
    ];
    if (dto.correctiveAction !== undefined) {
      const action = dto.correctiveAction.trim();
      if (action !== doc.correctiveAction) {
        changes.push({
          field: "correctiveAction",
          from: doc.correctiveAction,
          to: action,
        });
        doc.correctiveAction = action;
      }
    }
    doc.status = DeviationStatus.Closed;
    doc.closedAt = new Date();
    doc.closedByUserId = user.userId ? String(user.userId) : null;
    doc.closedByName = actorName;
    doc.closingComment = comment;
    doc.history.push(
      this.historyEntry(user, actorName, "closed", { changes, comment }),
    );
    await doc.save();
    return this.view(doc, user, project);
  }

  async reopen(id: string, dto: ReopenDeviationDto, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const { doc, project } = await this.loadDeviation(id, user);
    if (!canManage(user, project)) {
      throw new ForbiddenException(
        "Only an admin or project admin can reopen a deviation",
      );
    }
    if (doc.status !== DeviationStatus.Closed) {
      throw new BadRequestException("The deviation is not closed");
    }
    const actorName = await this.userName(user.userId, user.email || "");
    doc.status = DeviationStatus.Open;
    doc.closedAt = null;
    doc.closedByUserId = null;
    doc.closedByName = "";
    doc.closingComment = "";
    doc.overdueNotifiedAt = null;
    doc.dueSoonNotifiedAt = null;
    doc.history.push(
      this.historyEntry(user, actorName, "reopened", {
        changes: [
          {
            field: "status",
            from: DeviationStatus.Closed,
            to: DeviationStatus.Open,
          },
        ],
        comment: (dto.comment || "").trim(),
      }),
    );
    await doc.save();
    return this.view(doc, user, project);
  }

  async addPhotos(
    id: string,
    files: UploadedDeviationPhoto[],
    user: DeviationAuthUser,
  ) {
    await this.loadCompany(user);
    const { doc, project } = await this.loadDeviation(id, user);
    if (editScope(user, project, doc) === "none") {
      throw new ForbiddenException("You cannot add photos to this deviation");
    }
    for (const f of files) {
      doc.photos.push({
        url: `/uploads/deviation-photos/${f.filename}`,
        name: f.originalname || f.filename,
        uploadedAt: new Date(),
        uploadedByUserId: user.userId ? String(user.userId) : null,
      });
    }
    const actorName = await this.userName(user.userId, user.email || "");
    doc.history.push(
      this.historyEntry(user, actorName, "photos", {
        comment: String(files.length),
      }),
    );
    await doc.save();
    return this.view(doc, user, project);
  }

  async remove(id: string, user: DeviationAuthUser) {
    await this.loadCompany(user);
    const { doc } = await this.loadDeviation(id, user);
    if (!isCompanyWide(user)) {
      throw new ForbiddenException(
        "Only a company admin can delete a deviation",
      );
    }
    await this.deviations.findByIdAndDelete(doc._id).exec();
    // Photo files go with it (best effort: a missing file never fails this).
    await Promise.all(
      (doc.photos || [])
        .map((p) => String(p.url || ""))
        .filter((url) => url.startsWith("/uploads/deviation-photos/"))
        .map((url) =>
          unlink(join(process.cwd(), url.replace(/^\//, ""))).catch(
            () => undefined,
          ),
        ),
    );
    return { deleted: true };
  }

  // ---------- export (avviksrapport) ----------

  private async exportRows(user: DeviationAuthUser, query: DeviationListQuery) {
    const company = await this.loadCompany(user);
    const rows = await this.list(user, query);
    return {
      company,
      lang: reportLangForCountry(company.country) as ReportLang,
      rows: rows.slice().sort((a, b) => a.number - b.number) as (ExportRow & {
        overdue: boolean;
      })[],
    };
  }

  async exportCsv(user: DeviationAuthUser, query: DeviationListQuery) {
    const { rows, lang } = await this.exportRows(user, query);
    return { csv: buildCsv(rows, lang), lang };
  }

  async exportPdf(user: DeviationAuthUser, query: DeviationListQuery) {
    const { rows, lang, company } = await this.exportRows(user, query);
    const projectName = query.projectId
      ? (await this.loadProject(query.projectId, user)).name
      : "";
    const html = buildDeviationReportHtml({
      lang,
      companyName: company.name,
      orgNumber: company.orgNumber,
      projectName,
      printedAt: new Date(),
      rows,
    });
    const browser = await launchForInvoicePdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const buffer = Buffer.from(
        await page.pdf({ format: "A4", printBackground: true }),
      );
      return { buffer, lang };
    } finally {
      await browser.close();
    }
  }

  // ---------- notifications ----------

  private async managerIds(project: ProjectLean, companyId: string) {
    const admins = await this.users
      .find({ companyId, role: UserRole.CompanyAdmin })
      .select("_id")
      .lean()
      .exec();
    return [
      ...admins.map((a) => String(a._id)),
      String(project.ownerId ?? ""),
      String(project.projectManagerId ?? ""),
      ...(project.projectAdmins || []).map((v) => String(v ?? "")),
    ].filter(Boolean);
  }

  // Push in each recipient's language. Tap → the deviation itself
  // (screen "Deviation"); type deviation_* maps to the «deviations» setting so
  // every user can switch them off. Best effort: never fails the request.
  private async notify(
    userIds: string[],
    kind: NotifyKind,
    d: { _id: unknown; number: number; title: string; projectId: string },
    project?: { name?: string } | null,
  ) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    try {
      const users = await this.users
        .find({ _id: { $in: ids } })
        .select("_id language")
        .lean()
        .exec();
      const byLang = new Map<ReportLang, string[]>();
      for (const u of users) {
        const lang = pushLang(languageCode(u.language));
        byLang.set(lang, [...(byLang.get(lang) || []), String(u._id)]);
      }
      for (const [lang, group] of byLang) {
        const text = pushText(kind, lang, d, project?.name || "");
        await this.notifications.sendToUsers(group, {
          ...text,
          preferenceKey: "deviations",
          data: {
            type: `deviation_${kind}`,
            screen: "Deviation",
            deviationId: String(d._id),
            entityId: String(d._id),
            projectId: String(d.projectId),
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Deviation push failed: ${(error as Error)?.message || error}`,
      );
    }
  }

  // Every morning: «due soon» (due today or tomorrow) and «overdue» pushes,
  // once per due date, to the responsible (overdue without a responsible →
  // the project's managers).
  @Cron("0 7 * * *", { timeZone: "Europe/Stockholm" })
  async runReminders() {
    if (cronsDisabled() || this.processingReminders) return;
    this.processingReminders = true;
    try {
      await this.processReminders(new Date());
    } catch (error) {
      this.logger.error("Deviation reminders failed", error);
    } finally {
      this.processingReminders = false;
    }
  }

  // Companies whose plan includes avvik (others get no reminders).
  private async companiesWithAvvik(companyIds: string[]) {
    const unique = [...new Set(companyIds.map(String).filter(Boolean))];
    if (!unique.length) return [];
    const rows = await this.companies
      .find({ _id: { $in: unique } })
      .select("plan moduleOverrides maxUsers")
      .lean()
      .exec();
    return rows
      .filter((c) => resolveModules(c).enabled.includes("avvik"))
      .map((c) => String(c._id));
  }

  // Claim the reminder before sending (atomic): two servers running the cron
  // can never both push the same one.
  private async claim(
    id: unknown,
    field: "dueSoonNotifiedAt" | "overdueNotifiedAt",
    now: Date,
  ) {
    const claimed = await this.deviations
      .findOneAndUpdate(
        { _id: id, [field]: null },
        { $set: { [field]: now } },
        { new: true },
      )
      .exec();
    return claimed;
  }

  async processReminders(now: Date) {
    const today = startOfDayUtc(now);
    const dayAfterTomorrow = new Date(today.getTime() + 2 * DAY_MS);
    const open = { status: { $ne: DeviationStatus.Closed } };
    const dueSoonFilter = {
      ...open,
      responsibleUserId: { $ne: null },
      dueDate: { $gte: today, $lt: dayAfterTomorrow },
      dueSoonNotifiedAt: null,
    };
    const overdueFilter = {
      ...open,
      dueDate: { $ne: null, $lt: today },
      overdueNotifiedAt: null,
    };
    const allowed = await this.companiesWithAvvik([
      ...((await this.deviations
        .distinct("companyId", dueSoonFilter)
        .exec()) as string[]),
      ...((await this.deviations
        .distinct("companyId", overdueFilter)
        .exec()) as string[]),
    ]);
    if (!allowed.length) return { dueSoon: 0, overdue: 0 };
    const inAllowed = { companyId: { $in: allowed } };

    const dueSoon = await this.deviations
      .find({ ...dueSoonFilter, ...inAllowed })
      .limit(500)
      .exec();
    const overdue = await this.deviations
      .find({ ...overdueFilter, ...inAllowed })
      .limit(500)
      .exec();

    const projects = await this.projectsById(
      [...dueSoon, ...overdue].map((d) => String(d.projectId)),
    );
    let sentSoon = 0;
    let sentOverdue = 0;
    for (const d of dueSoon) {
      if (!(await this.claim(d._id, "dueSoonNotifiedAt", now))) continue;
      await this.notify(
        [String(d.responsibleUserId)],
        "due_soon",
        d,
        projects.get(String(d.projectId)),
      );
      sentSoon += 1;
    }
    for (const d of overdue) {
      if (!(await this.claim(d._id, "overdueNotifiedAt", now))) continue;
      const project = projects.get(String(d.projectId));
      const to = d.responsibleUserId
        ? [String(d.responsibleUserId)]
        : project
          ? await this.managerIds(project, String(d.companyId))
          : [];
      await this.notify(to, "overdue", d, project);
      sentOverdue += 1;
    }
    return { dueSoon: sentSoon, overdue: sentOverdue };
  }
}
