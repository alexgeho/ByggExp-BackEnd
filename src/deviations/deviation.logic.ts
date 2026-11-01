// Pure rules for deviations (avvik): who may do what, status transitions,
// overdue, list filters, labels and the CSV export. No database here, so it is
// unit-tested directly (deviation.logic.spec.ts).
import { UserRole } from "../users/schemas/user.schema";
import {
  DeviationCategory,
  DeviationSeverity,
  DeviationStatus,
} from "./schemas/deviation.schema";

export type DeviationActor = {
  role: UserRole | string;
  userId?: string | null;
  companyId?: string | null;
};

export type ProjectMembers = {
  ownerId?: unknown;
  projectManagerId?: unknown;
  projectAdmins?: unknown[];
  workers?: unknown[];
};

export type DeviationLike = {
  status: DeviationStatus | string;
  dueDate?: Date | string | null;
  reportedByUserId?: string | null;
  responsibleUserId?: string | null;
};

const COMPANY_WIDE = [UserRole.SuperAdmin, UserRole.CompanyAdmin] as string[];

export const isCompanyWide = (actor: DeviationActor) =>
  COMPANY_WIDE.includes(String(actor.role));

// Project-scope managers: the project's owner, manager and project admins.
export function isProjectManager(
  actor: DeviationActor,
  project: ProjectMembers,
): boolean {
  if (actor.role !== UserRole.ProjectAdmin || !actor.userId) return false;
  const uid = String(actor.userId);
  return [
    project.ownerId,
    project.projectManagerId,
    ...(project.projectAdmins || []),
  ]
    .map((v) => String(v ?? ""))
    .includes(uid);
}

export function isProjectMember(
  actor: DeviationActor,
  project: ProjectMembers,
): boolean {
  if (!actor.userId) return false;
  const uid = String(actor.userId);
  return [
    project.ownerId,
    project.projectManagerId,
    ...(project.projectAdmins || []),
    ...(project.workers || []),
  ]
    .map((v) => String(v ?? ""))
    .includes(uid);
}

// See and report on a project: company admins anywhere in the company,
// everybody else only on projects they belong to (same rule as tasks/orders).
export const canAccessProject = (
  actor: DeviationActor,
  project: ProjectMembers,
) => isCompanyWide(actor) || isProjectMember(actor, project);

// Manage = assign, set due date, close, reopen, edit anything.
export const canManage = (actor: DeviationActor, project: ProjectMembers) =>
  isCompanyWide(actor) || isProjectManager(actor, project);

// A worker may edit the description of what they reported while it is open,
// and — when they are the responsible — the cause/action and «in progress».
export type EditScope =
  | "all"
  | "reporter"
  | "responsible"
  | "reporter+responsible"
  | "none";

export function editScope(
  actor: DeviationActor,
  project: ProjectMembers,
  deviation: DeviationLike,
): EditScope {
  if (canManage(actor, project)) return "all";
  if (deviation.status === DeviationStatus.Closed) return "none";
  const uid = String(actor.userId || "");
  const reporter =
    !!uid &&
    String(deviation.reportedByUserId || "") === uid &&
    deviation.status === DeviationStatus.Open;
  const responsible =
    !!uid && String(deviation.responsibleUserId || "") === uid;
  if (reporter && responsible) return "reporter+responsible";
  if (reporter) return "reporter";
  if (responsible) return "responsible";
  return "none";
}

export const REPORTER_FIELDS = [
  "title",
  "description",
  "category",
  "severity",
  "location",
] as const;
export const RESPONSIBLE_FIELDS = [
  "cause",
  "correctiveAction",
  "status",
] as const;
export const MANAGER_FIELDS = [
  ...REPORTER_FIELDS,
  "cause",
  "correctiveAction",
  "status",
  "responsibleUserId",
  "dueDate",
] as const;

export function allowedFields(scope: EditScope): readonly string[] {
  switch (scope) {
    case "all":
      return MANAGER_FIELDS;
    case "reporter":
      return REPORTER_FIELDS;
    case "responsible":
      return RESPONSIBLE_FIELDS;
    case "reporter+responsible":
      return [...REPORTER_FIELDS, ...RESPONSIBLE_FIELDS];
    default:
      return [];
  }
}

// Status changes through PUT: open ⇄ in_progress. Closing and reopening have
// their own endpoints (closing needs a comment, both are logged as such).
export function canTransition(
  from: DeviationStatus | string,
  to: DeviationStatus | string,
): boolean {
  if (from === to) return true;
  const allowed: Record<string, string[]> = {
    [DeviationStatus.Open]: [
      DeviationStatus.InProgress,
      DeviationStatus.Closed,
    ],
    [DeviationStatus.InProgress]: [
      DeviationStatus.Open,
      DeviationStatus.Closed,
    ],
    [DeviationStatus.Closed]: [DeviationStatus.Open],
  };
  return (allowed[from] || []).includes(to);
}

// A due date is a calendar day; the deviation is overdue from the next day on.
export function startOfDayUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function isOverdue(d: DeviationLike, now = new Date()): boolean {
  if (d.status === DeviationStatus.Closed || !d.dueDate) return false;
  const due = new Date(d.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < startOfDayUtc(now).getTime();
}

// "YYYY-MM-DD" (or ISO) → Date at UTC midnight; ""/null → null.
export function parseDueDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type DeviationListQuery = {
  projectId?: string;
  status?: string;
  category?: string;
  severity?: string;
  responsibleUserId?: string;
  overdue?: string | boolean;
  mine?: string | boolean;
};

const truthy = (v: unknown) => v === true || v === "true" || v === "1";

// Mongo filter for the list. `projectScope` = project ids the actor may see
// (null = the whole company).
export function buildListFilter(
  companyId: string,
  query: DeviationListQuery,
  projectScope: string[] | null,
  actor: DeviationActor,
  now = new Date(),
): Record<string, unknown> {
  const filter: Record<string, unknown> = { companyId };
  if (projectScope) {
    filter.projectId = query.projectId
      ? projectScope.includes(query.projectId)
        ? query.projectId
        : { $in: [] }
      : { $in: projectScope };
  } else if (query.projectId) {
    filter.projectId = query.projectId;
  }
  const statuses = String(query.status || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => (Object.values(DeviationStatus) as string[]).includes(s));
  if (statuses.length === 1) filter.status = statuses[0];
  else if (statuses.length > 1) filter.status = { $in: statuses };
  if (
    query.category &&
    (Object.values(DeviationCategory) as string[]).includes(query.category)
  ) {
    filter.category = query.category;
  }
  if (
    query.severity &&
    (Object.values(DeviationSeverity) as string[]).includes(query.severity)
  ) {
    filter.severity = query.severity;
  }
  if (query.responsibleUserId)
    filter.responsibleUserId = query.responsibleUserId;
  if (truthy(query.mine) && actor.userId) {
    filter.$or = [
      { responsibleUserId: String(actor.userId) },
      { reportedByUserId: String(actor.userId) },
    ];
  }
  if (truthy(query.overdue)) {
    filter.dueDate = { $ne: null, $lt: startOfDayUtc(now) };
    if (!filter.status) filter.status = { $ne: DeviationStatus.Closed };
    else if (filter.status === DeviationStatus.Closed)
      filter.status = { $in: [] };
  }
  return filter;
}

// ---- labels (avviksrapport, CSV, push) --------------------------------------

export type ReportLang = "nb" | "sv" | "en";

export const reportLangForCountry = (country?: string | null): ReportLang =>
  String(country || "").toUpperCase() === "NO" ? "nb" : "sv";

export const pushLang = (code?: string | null): ReportLang =>
  code === "nb" || code === "no" ? "nb" : code === "en" ? "en" : "sv";

export const LABELS: Record<ReportLang, Record<string, string>> = {
  nb: {
    deviation: "Avvik",
    report: "Avviksrapport",
    number: "Nr",
    title: "Tittel",
    description: "Beskrivelse",
    category: "Kategori",
    severity: "Alvorlighet",
    location: "Sted",
    reportedBy: "Meldt av",
    reportedAt: "Meldt",
    responsible: "Ansvarlig",
    dueDate: "Frist",
    cause: "Årsak",
    correctiveAction: "Tiltak",
    status: "Status",
    closedBy: "Lukket av",
    closedAt: "Lukket",
    closingComment: "Kommentar ved lukking",
    project: "Prosjekt",
    printed: "Utskrevet",
    overdue: "Forfalt",
    total: "Totalt",
    hms: "HMS",
    quality: "Kvalitet",
    environment: "Miljø",
    low: "Lav",
    medium: "Middels",
    high: "Høy",
    open: "Åpen",
    in_progress: "Under arbeid",
    closed: "Lukket",
  },
  sv: {
    deviation: "Avvikelse",
    report: "Avvikelserapport",
    number: "Nr",
    title: "Rubrik",
    description: "Beskrivning",
    category: "Kategori",
    severity: "Allvarlighet",
    location: "Plats",
    reportedBy: "Rapporterad av",
    reportedAt: "Rapporterad",
    responsible: "Ansvarig",
    dueDate: "Åtgärdas senast",
    cause: "Orsak",
    correctiveAction: "Åtgärd",
    status: "Status",
    closedBy: "Stängd av",
    closedAt: "Stängd",
    closingComment: "Kommentar vid stängning",
    project: "Projekt",
    printed: "Utskriven",
    overdue: "Försenad",
    total: "Totalt",
    hms: "Arbetsmiljö",
    quality: "Kvalitet",
    environment: "Miljö",
    low: "Låg",
    medium: "Medel",
    high: "Hög",
    open: "Öppen",
    in_progress: "Pågår",
    closed: "Stängd",
  },
  en: {
    deviation: "Deviation",
    report: "Deviation report",
    number: "No.",
    title: "Title",
    description: "Description",
    category: "Category",
    severity: "Severity",
    location: "Location",
    reportedBy: "Reported by",
    reportedAt: "Reported",
    responsible: "Responsible",
    dueDate: "Due date",
    cause: "Cause",
    correctiveAction: "Corrective action",
    status: "Status",
    closedBy: "Closed by",
    closedAt: "Closed",
    closingComment: "Closing comment",
    project: "Project",
    printed: "Printed",
    overdue: "Overdue",
    total: "Total",
    hms: "HSE",
    quality: "Quality",
    environment: "Environment",
    low: "Low",
    medium: "Medium",
    high: "High",
    open: "Open",
    in_progress: "In progress",
    closed: "Closed",
  },
};

export const label = (lang: ReportLang, key?: string | null) =>
  (key && LABELS[lang][key]) || key || "";

export const isoDay = (d?: Date | string | null) => {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export type ExportRow = {
  number: number;
  title: string;
  description?: string;
  category: string;
  severity: string;
  location?: string;
  projectName?: string;
  reportedByName?: string;
  reportedAt?: Date | string | null;
  responsibleName?: string;
  dueDate?: Date | string | null;
  cause?: string;
  correctiveAction?: string;
  status: string;
  closedByName?: string;
  closedAt?: Date | string | null;
  closingComment?: string;
};

const csvCell = (v: unknown) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Semicolon CSV with BOM: opens straight in Excel (SE/NO default separator).
export function buildCsv(rows: ExportRow[], lang: ReportLang): string {
  const L = LABELS[lang];
  const header = [
    L.number,
    L.title,
    L.project,
    L.category,
    L.severity,
    L.location,
    L.status,
    L.reportedBy,
    L.reportedAt,
    L.responsible,
    L.dueDate,
    L.description,
    L.cause,
    L.correctiveAction,
    L.closedBy,
    L.closedAt,
    L.closingComment,
  ];
  const lines = rows.map((r) =>
    [
      r.number,
      r.title,
      r.projectName,
      label(lang, r.category),
      label(lang, r.severity),
      r.location,
      label(lang, r.status),
      r.reportedByName,
      isoDay(r.reportedAt),
      r.responsibleName,
      isoDay(r.dueDate),
      r.description,
      r.cause,
      r.correctiveAction,
      r.closedByName,
      isoDay(r.closedAt),
      r.closingComment,
    ]
      .map(csvCell)
      .join(";"),
  );
  return "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
}

// Field diff for the history log (dates compared by day).
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): { field: string; from: unknown; to: unknown }[] {
  const norm = (k: string, v: unknown) =>
    k === "dueDate" ? isoDay(v as Date) || null : (v ?? "");
  return fields
    .filter((f) => f in after)
    .map((f) => ({ field: f, from: norm(f, before[f]), to: norm(f, after[f]) }))
    .filter((c) => String(c.from ?? "") !== String(c.to ?? ""));
}

// Checklist KMA category → deviation category (for the prefill).
export function categoryFromChecklist(c?: string | null): DeviationCategory {
  if (c === "work_environment") return DeviationCategory.Hms;
  if (c === "environment") return DeviationCategory.Environment;
  return DeviationCategory.Quality;
}

// Push copy per recipient language.
export function pushText(
  kind: "assigned" | "reported" | "due_soon" | "overdue",
  lang: ReportLang,
  d: { number: number; title: string },
  projectName = "",
): { title: string; body: string } {
  const word = LABELS[lang].deviation;
  const body = [d.title, projectName].filter(Boolean).join(" · ");
  const titles: Record<ReportLang, Record<typeof kind, string>> = {
    nb: {
      assigned: `${word} #${d.number} er tildelt deg`,
      reported: `Nytt avvik #${d.number}`,
      due_soon: `${word} #${d.number}: fristen nærmer seg`,
      overdue: `${word} #${d.number} har passert fristen`,
    },
    sv: {
      assigned: `${word} #${d.number} är tilldelad dig`,
      reported: `Ny avvikelse #${d.number}`,
      due_soon: `${word} #${d.number}: ska åtgärdas snart`,
      overdue: `${word} #${d.number} är försenad`,
    },
    en: {
      assigned: `${word} #${d.number} assigned to you`,
      reported: `New deviation #${d.number}`,
      due_soon: `${word} #${d.number} is due soon`,
      overdue: `${word} #${d.number} is overdue`,
    },
  };
  return { title: titles[lang][kind], body };
}
