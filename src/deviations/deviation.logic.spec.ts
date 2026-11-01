import { UserRole } from "../users/schemas/user.schema";
import {
  allowedFields,
  buildCsv,
  buildListFilter,
  canAccessProject,
  canManage,
  canTransition,
  categoryFromChecklist,
  diffFields,
  editScope,
  isOverdue,
  parseDueDate,
  pushLang,
  pushText,
  reportLangForCountry,
} from "./deviation.logic";
import { DeviationStatus } from "./schemas/deviation.schema";

const project = {
  ownerId: "owner",
  projectManagerId: "pm",
  projectAdmins: ["pa"],
  workers: ["w1", "w2"],
};
const admin = { role: UserRole.CompanyAdmin, userId: "a", companyId: "c" };
const pa = { role: UserRole.ProjectAdmin, userId: "pa", companyId: "c" };
const paOther = { role: UserRole.ProjectAdmin, userId: "x", companyId: "c" };
const w1 = { role: UserRole.Worker, userId: "w1", companyId: "c" };
const w2 = { role: UserRole.Worker, userId: "w2", companyId: "c" };
const outsider = { role: UserRole.Worker, userId: "zz", companyId: "c" };

describe("deviation permissions", () => {
  it("company admin manages everything, project admin only own projects", () => {
    expect(canManage(admin, project)).toBe(true);
    expect(canManage(pa, project)).toBe(true);
    expect(canManage(paOther, project)).toBe(false);
    expect(canManage(w1, project)).toBe(false);
  });

  it("workers see/report only on projects they belong to", () => {
    expect(canAccessProject(w1, project)).toBe(true);
    expect(canAccessProject(outsider, project)).toBe(false);
    expect(canAccessProject(admin, { workers: [] })).toBe(true);
  });

  it("reporter edits the description while open; responsible the action/status", () => {
    const dev = {
      status: DeviationStatus.Open,
      reportedByUserId: "w1",
      responsibleUserId: "w2",
    };
    expect(editScope(w1, project, dev)).toBe("reporter");
    expect(allowedFields("reporter")).not.toContain("responsibleUserId");
    expect(allowedFields("reporter")).not.toContain("status");
    expect(editScope(w2, project, dev)).toBe("responsible");
    expect(allowedFields("responsible")).toEqual(
      expect.arrayContaining(["correctiveAction", "status"]),
    );
    expect(allowedFields("responsible")).not.toContain("dueDate");
    expect(editScope(outsider, project, dev)).toBe("none");
    expect(editScope(pa, project, dev)).toBe("all");
  });

  it("reporter loses edit once the deviation is in progress; closed = managers only", () => {
    expect(
      editScope(w1, project, {
        status: DeviationStatus.InProgress,
        reportedByUserId: "w1",
      }),
    ).toBe("none");
    expect(
      editScope(w2, project, {
        status: DeviationStatus.Closed,
        responsibleUserId: "w2",
      }),
    ).toBe("none");
    expect(editScope(admin, project, { status: DeviationStatus.Closed })).toBe(
      "all",
    );
  });
});

describe("status transitions", () => {
  it("open → in_progress → closed → open", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "closed")).toBe(true);
    expect(canTransition("in_progress", "open")).toBe(true);
    expect(canTransition("closed", "open")).toBe(true);
  });

  it("closed cannot jump to in_progress; unknown states are refused", () => {
    expect(canTransition("closed", "in_progress")).toBe(false);
    expect(canTransition("open", "done")).toBe(false);
  });
});

describe("overdue", () => {
  const now = new Date("2026-11-10T09:00:00Z");
  it("is overdue from the day after the due date, never when closed", () => {
    expect(isOverdue({ status: "open", dueDate: "2026-11-09" }, now)).toBe(
      true,
    );
    expect(isOverdue({ status: "open", dueDate: "2026-11-10" }, now)).toBe(
      false,
    );
    expect(
      isOverdue(
        { status: "in_progress", dueDate: new Date("2026-11-01") },
        now,
      ),
    ).toBe(true);
    expect(isOverdue({ status: "closed", dueDate: "2026-11-01" }, now)).toBe(
      false,
    );
    expect(isOverdue({ status: "open", dueDate: null }, now)).toBe(false);
  });

  it("parses YYYY-MM-DD due dates to UTC midnight", () => {
    expect(parseDueDate("2026-11-10")?.toISOString()).toBe(
      "2026-11-10T00:00:00.000Z",
    );
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("10.11.2026")).toBeUndefined();
    expect(parseDueDate("2026-02-31")).toBeUndefined();
  });
});

describe("overdue on the Stockholm calendar", () => {
  it("at 00:30 local time (still yesterday in UTC) yesterday's due date is overdue", () => {
    const now = new Date("2026-11-09T23:30:00Z"); // 2026-11-10 00:30 in Stockholm
    expect(isOverdue({ status: "open", dueDate: "2026-11-09" }, now)).toBe(
      true,
    );
    expect(isOverdue({ status: "open", dueDate: "2026-11-10" }, now)).toBe(
      false,
    );
  });
});

describe("CSV formula injection", () => {
  it("prefixes cells starting with = + - @ tab or CR", () => {
    const csv = buildCsv(
      [
        {
          number: 1,
          title: '=HYPERLINK("http://x")',
          category: "hms",
          severity: "low",
          status: "open",
          location: "+1",
          description: "-2",
          cause: "@SUM(A1)",
          correctiveAction: "\tx",
          closingComment: "\rboom",
        },
      ],
      "sv",
    );
    const row = csv.split("\r\n")[1];
    expect(row).toContain('"\'=HYPERLINK(""http://x"")"');
    expect(row).toContain(";'+1;");
    expect(row).toContain(";'-2;");
    expect(row).toContain(";'@SUM(A1);");
    expect(row).toContain(";'\tx;");
    expect(row.endsWith("' boom")).toBe(true);
    expect(row).not.toMatch(/;[=+@]/);
  });
});

describe("list filter", () => {
  const now = new Date("2026-11-10T09:00:00Z");
  it("company-wide filters by project/status/category/responsible", () => {
    const f = buildListFilter(
      "c",
      {
        projectId: "p1",
        status: "open,in_progress",
        category: "hms",
        responsibleUserId: "u",
      },
      null,
      admin,
      now,
    );
    expect(f).toEqual({
      companyId: "c",
      projectId: "p1",
      status: { $in: ["open", "in_progress"] },
      category: "hms",
      responsibleUserId: "u",
    });
  });

  it("scoped actors only get their projects, even when asking for another", () => {
    expect(buildListFilter("c", {}, ["p1", "p2"], w1).projectId).toEqual({
      $in: ["p1", "p2"],
    });
    expect(
      buildListFilter("c", { projectId: "p9" }, ["p1"], w1).projectId,
    ).toEqual({ $in: [] });
    expect(
      buildListFilter("c", { projectId: "p1" }, ["p1"], w1).projectId,
    ).toBe("p1");
  });

  it("overdue = not closed and due before today; junk values are ignored", () => {
    const f = buildListFilter(
      "c",
      { overdue: "true", category: "nope", status: "bogus" },
      null,
      admin,
      now,
    );
    expect(f.status).toEqual({ $ne: "closed" });
    expect(f.dueDate).toEqual({
      $ne: null,
      $lt: new Date("2026-11-10T00:00:00.000Z"),
    });
    expect(f.category).toBeUndefined();
  });

  it("mine = reported by me or assigned to me", () => {
    expect(buildListFilter("c", { mine: "true" }, ["p1"], w1).$or).toEqual([
      { responsibleUserId: "w1" },
      { reportedByUserId: "w1" },
    ]);
  });
});

describe("labels, CSV, push", () => {
  it("bokmål for Norwegian companies, Swedish otherwise", () => {
    expect(reportLangForCountry("NO")).toBe("nb");
    expect(reportLangForCountry("SE")).toBe("sv");
    expect(reportLangForCountry(undefined)).toBe("sv");
    expect(pushLang("nb")).toBe("nb");
    expect(pushLang("pl")).toBe("sv");
  });

  it("CSV is semicolon separated with translated values", () => {
    const csv = buildCsv(
      [
        {
          number: 3,
          title: 'Rekkverk "mangler"; plan 2',
          category: "hms",
          severity: "high",
          status: "in_progress",
          dueDate: new Date("2026-11-12T00:00:00Z"),
        },
      ],
      "nb",
    );
    const [header, row] = csv.replace(/^﻿/, "").split("\r\n");
    expect(
      header.startsWith("Nr;Tittel;Prosjekt;Kategori;Alvorlighetsgrad;"),
    ).toBe(true);
    expect(row).toContain('"Rekkverk ""mangler""; plan 2"');
    expect(row).toContain(";HMS;Høy;");
    expect(row).toContain("Under arbeid");
    expect(row).toContain("2026-11-12");
    expect(buildCsv([], "sv")).toContain("Rubrik");
  });

  it("push text names the deviation number", () => {
    expect(
      pushText("assigned", "nb", { number: 7, title: "Stillas" }, "Bygg A"),
    ).toEqual({
      title: "Avvik #7 er tildelt deg",
      body: "Stillas · Bygg A",
    });
    expect(pushText("overdue", "sv", { number: 7, title: "x" }).title).toBe(
      "Avvikelse #7 är försenad",
    );
  });

  it("diff ignores unchanged fields and compares due dates by day", () => {
    const changes = diffFields(
      { title: "A", dueDate: new Date("2026-11-12T00:00:00Z"), cause: "" },
      { title: "A", dueDate: new Date("2026-11-12T00:00:00Z"), cause: "Glemt" },
      ["title", "dueDate", "cause"],
    );
    expect(changes).toEqual([{ field: "cause", from: "", to: "Glemt" }]);
  });

  it("checklist category maps to deviation category", () => {
    expect(categoryFromChecklist("work_environment")).toBe("hms");
    expect(categoryFromChecklist("environment")).toBe("environment");
    expect(categoryFromChecklist("other")).toBe("quality");
  });
});

describe("avviksrapport HTML", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    buildDeviationReportHtml,
  } = require("./templates/deviation-report.template");
  it("renders bokmål headings, counters and escapes text", () => {
    const html: string = buildDeviationReportHtml({
      lang: "nb",
      companyName: "Firma AS",
      projectName: "Bygg <A>",
      printedAt: new Date("2026-11-10T00:00:00Z"),
      rows: [
        {
          number: 1,
          title: "Rekkverk",
          category: "hms",
          severity: "high",
          status: "open",
          overdue: true,
          dueDate: "2026-11-01",
        },
        {
          number: 2,
          title: "Støv",
          category: "environment",
          severity: "low",
          status: "closed",
          closingComment: "Ryddet",
        },
      ],
    });
    expect(html).toContain("Avviksrapport");
    expect(html).toContain("Bygg &lt;A&gt;");
    expect(html).toContain("Kommentar ved lukking");
    expect(html).toContain('class="late"');
    expect(html).toMatch(/Forfalt<\/span><span class="val">1/);
  });
});
