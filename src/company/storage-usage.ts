import * as fs from "fs";
import * as path from "path";
import { Connection } from "mongoose";

// Per-company breakdown of how much uploaded-file storage a tenant occupies on
// disk. Sizes are read from the actual files under ./uploads and attributed to a
// company through each record's company link (direct companyId, or via the
// user/project the record belongs to). Superadmin-only reporting.

export type CompanyStorageRow = {
  companyId: string;
  name: string;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<string, number>;
};

export type StorageUsageReport = {
  companies: CompanyStorageRow[];
  totalDiskBytes: number; // everything under ./uploads
  attributedBytes: number; // sum attributed to a company
  orphanBytes: number; // files on disk not linked to any company record
  generatedAt: string;
};

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

type Doc = Record<string, any>;

// How each file-bearing collection exposes its file URLs and which company owns
// the record. `link` decides how companyId is resolved for a given document.
type Source = {
  model: string;
  category: string;
  link: "self" | "companyId" | "userSelf" | "user" | "project" | "task";
  filter: Record<string, unknown>;
  project: Record<string, 1>;
  urls: (doc: Doc) => (string | null | undefined)[];
};

const nonEmpty = { $nin: [null, ""] };

const SOURCES: Source[] = [
  {
    model: "Company",
    category: "logos",
    link: "self",
    filter: { logoUrl: nonEmpty },
    project: { logoUrl: 1 },
    urls: (d) => [d.logoUrl],
  },
  {
    model: "SupplierInvoice",
    category: "supplier-invoices",
    link: "companyId",
    filter: { attachmentUrl: nonEmpty },
    project: { attachmentUrl: 1, companyId: 1 },
    urls: (d) => [d.attachmentUrl],
  },
  {
    model: "Expense",
    category: "expenses",
    link: "companyId",
    filter: { receiptUrl: nonEmpty },
    project: { receiptUrl: 1, companyId: 1 },
    urls: (d) => [d.receiptUrl],
  },
  {
    model: "Ata",
    category: "ata",
    link: "companyId",
    filter: { attachmentUrl: nonEmpty },
    project: { attachmentUrl: 1, companyId: 1 },
    urls: (d) => [d.attachmentUrl],
  },
  {
    model: "DagbokEntry",
    category: "dagbok",
    link: "companyId",
    filter: { "photoUrls.0": { $exists: true } },
    project: { photoUrls: 1, companyId: 1 },
    urls: (d) => d.photoUrls || [],
  },
  {
    model: "Tool",
    category: "tools",
    link: "companyId",
    filter: {
      $or: [{ photoUrl: nonEmpty }, { "photoUrls.0": { $exists: true } }],
    },
    project: { photoUrl: 1, photoUrls: 1, companyId: 1 },
    urls: (d) => [d.photoUrl, ...(d.photoUrls || [])],
  },
  {
    model: "BugReport",
    category: "bug-reports",
    link: "companyId",
    filter: { "attachment.url": nonEmpty },
    project: { attachment: 1, companyId: 1 },
    urls: (d) => [d.attachment?.url],
  },
  {
    model: "Project",
    category: "project-documents",
    link: "companyId",
    filter: { "documents.0": { $exists: true } },
    project: { documents: 1, companyId: 1 },
    urls: (d) =>
      (d.documents || []).map((x: any) => (typeof x === "string" ? x : x?.url)),
  },
  {
    model: "User",
    category: "user-files",
    link: "userSelf",
    filter: {
      $or: [
        { avatarUrl: nonEmpty },
        { "additionalDocuments.0": { $exists: true } },
        { "certificates.0": { $exists: true } },
      ],
    },
    project: {
      avatarUrl: 1,
      additionalDocuments: 1,
      certificates: 1,
      companyId: 1,
    },
    urls: (d) => [
      d.avatarUrl,
      ...(d.additionalDocuments || []),
      ...((d.certificates || []).map((c: any) => c?.fileUrl)),
    ],
  },
  {
    model: "Task",
    category: "task-documents",
    link: "task",
    filter: { "documents.0": { $exists: true } },
    project: { documents: 1, projectId: 1, userId: 1 },
    urls: (d) =>
      (d.documents || []).map((x: any) => (typeof x === "string" ? x : x?.url)),
  },
  {
    model: "Shift",
    category: "shift-photos",
    link: "project",
    filter: { "photos.0": { $exists: true } },
    project: { photos: 1, projectId: 1 },
    urls: (d) => (d.photos || []).map((p: any) => p?.url),
  },
  {
    model: "Message",
    category: "chat-attachments",
    link: "user",
    filter: { "attachments.0": { $exists: true } },
    project: { attachments: 1, userId: 1 },
    urls: (d) => (d.attachments || []).map((a: any) => a?.url),
  },
];

// Index every file under ./uploads as `/uploads/<dir>/<file>` -> size, plus a
// basename fallback (filenames are timestamped, so collisions are unlikely).
function buildSizeIndex(): {
  byPath: Map<string, number>;
  byName: Map<string, number>;
  totalBytes: number;
} {
  const byPath = new Map<string, number>();
  const byName = new Map<string, number>();
  let totalBytes = 0;
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(UPLOADS_ROOT);
  } catch {
    return { byPath, byName, totalBytes };
  }
  for (const dir of dirs) {
    const abs = path.join(UPLOADS_ROOT, dir);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      byPath.set(`/uploads/${dir}`, stat.size);
      byName.set(dir, stat.size);
      totalBytes += stat.size;
      continue;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const s = fs.statSync(path.join(abs, name));
        if (!s.isFile()) continue;
        byPath.set(`/uploads/${dir}/${name}`, s.size);
        byName.set(name, s.size);
        totalBytes += s.size;
      } catch {
        /* ignore unreadable entry */
      }
    }
  }
  return { byPath, byName, totalBytes };
}

// Resolve a stored url string to a size in bytes (0 if the file is gone).
function sizeForUrl(
  url: unknown,
  byPath: Map<string, number>,
  byName: Map<string, number>,
): number {
  if (typeof url !== "string" || !url) return 0;
  const idx = url.indexOf("/uploads/");
  const normalized = idx >= 0 ? url.slice(idx) : url;
  if (byPath.has(normalized)) return byPath.get(normalized)!;
  const base = path.basename(normalized.split("?")[0]);
  return byName.get(base) || 0;
}

export async function computeStorageUsage(
  connection: Connection,
): Promise<StorageUsageReport> {
  const { byPath, byName, totalBytes } = buildSizeIndex();

  // company id -> name, seeded with every company so zero-usage tenants show up.
  const names = new Map<string, string>();
  const rows = new Map<string, CompanyStorageRow>();
  const ensureRow = (companyId: string): CompanyStorageRow => {
    let row = rows.get(companyId);
    if (!row) {
      row = {
        companyId,
        name: names.get(companyId) || "—",
        totalBytes: 0,
        fileCount: 0,
        byCategory: {},
      };
      rows.set(companyId, row);
    }
    return row;
  };

  const companyModel = connection.models["Company"];
  if (companyModel) {
    const companies = await companyModel
      .find({}, { name: 1 })
      .lean()
      .exec();
    for (const c of companies as Doc[]) {
      const id = String(c._id);
      names.set(id, c.name || "—");
      ensureRow(id);
    }
  }

  // Preload the link maps used to attribute records that don't carry companyId.
  const userToCompany = new Map<string, string>();
  const projectToCompany = new Map<string, string>();
  const userModel = connection.models["User"];
  if (userModel) {
    const users = await userModel.find({}, { companyId: 1 }).lean().exec();
    for (const u of users as Doc[]) {
      if (u.companyId) userToCompany.set(String(u._id), String(u.companyId));
    }
  }
  const projectModel = connection.models["Project"];
  if (projectModel) {
    const projects = await projectModel
      .find({}, { companyId: 1 })
      .lean()
      .exec();
    for (const p of projects as Doc[]) {
      if (p.companyId)
        projectToCompany.set(String(p._id), String(p.companyId));
    }
  }

  const resolveCompany = (source: Source, doc: Doc): string | null => {
    switch (source.link) {
      case "self":
        return String(doc._id);
      case "companyId":
        return doc.companyId ? String(doc.companyId) : null;
      case "userSelf":
        return doc.companyId ? String(doc.companyId) : null;
      case "user":
        return doc.userId ? userToCompany.get(String(doc.userId)) || null : null;
      case "project":
        return doc.projectId
          ? projectToCompany.get(String(doc.projectId)) || null
          : null;
      case "task":
        if (doc.projectId)
          return projectToCompany.get(String(doc.projectId)) || null;
        if (doc.userId) return userToCompany.get(String(doc.userId)) || null;
        return null;
      default:
        return null;
    }
  };

  let attributedBytes = 0;

  for (const source of SOURCES) {
    const model = connection.models[source.model];
    if (!model) continue;
    let docs: Doc[] = [];
    try {
      docs = (await model
        .find(source.filter, source.project)
        .lean()
        .exec()) as Doc[];
    } catch {
      continue; // schema shape differs from expectations — skip gracefully
    }
    for (const doc of docs) {
      const companyId = resolveCompany(source, doc);
      if (!companyId) continue;
      const row = ensureRow(companyId);
      for (const url of source.urls(doc)) {
        const size = sizeForUrl(url, byPath, byName);
        if (!size) continue;
        row.totalBytes += size;
        row.fileCount += 1;
        row.byCategory[source.category] =
          (row.byCategory[source.category] || 0) + size;
        attributedBytes += size;
      }
    }
  }

  const companies = Array.from(rows.values()).sort(
    (a, b) => b.totalBytes - a.totalBytes,
  );

  return {
    companies,
    totalDiskBytes: totalBytes,
    attributedBytes,
    orphanBytes: Math.max(0, totalBytes - attributedBytes),
    generatedAt: new Date().toISOString(),
  };
}
