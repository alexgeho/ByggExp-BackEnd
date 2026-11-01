import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../users/schemas/user.schema";
import { DeviationsService } from "./deviations.service";

const unlinkMock = jest.fn(async () => undefined);
jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  unlink: (...args: unknown[]) => unlinkMock(...(args as [])),
}));
jest.mock("../invoices/puppeteer-launch", () => ({
  launchForInvoicePdf: jest.fn(),
}));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

// In-memory stand-ins for the mongoose models — just the calls the service
// makes (find/findById/... → { select, sort, limit, lean, exec }).
const chain = (result: () => unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "sort", "limit", "lean"]) q[m] = () => q;
  q.exec = async () => result();
  return q;
};

const matches = (
  doc: Record<string, unknown>,
  filter: Record<string, unknown>,
) =>
  Object.entries(filter).every(([k, v]) => {
    if (k === "$or")
      return (v as Record<string, unknown>[]).some((f) => matches(doc, f));
    const val = doc[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const cond = v as Record<string, unknown>;
      if ("$in" in cond)
        return (cond.$in as unknown[]).map(String).includes(String(val));
      if ("$ne" in cond && val === cond.$ne) return false;
      if ("$lt" in cond && !(val instanceof Date && val < (cond.$lt as Date)))
        return false;
      if (
        "$gte" in cond &&
        !(val instanceof Date && val >= (cond.$gte as Date))
      )
        return false;
      return true;
    }
    if (Array.isArray(val)) return val.map(String).includes(String(v));
    return val === v || (val == null && v == null);
  });

function makeDeviationModel() {
  const docs: Record<string, any>[] = [];
  let id = 0;
  const wrap = (data: Record<string, any>) => {
    const doc: Record<string, any> = {
      _id: `d${++id}`,
      photos: [],
      history: [],
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      ...data,
    };
    doc.save = async () => doc;
    doc.toObject = () => {
      const { save, toObject, ...rest } = doc;
      void save;
      void toObject;
      return { ...rest };
    };
    return doc;
  };
  return {
    docs,
    create: async (data: Record<string, any>) => {
      const doc = wrap(data);
      docs.push(doc);
      return doc;
    },
    findById: (key: string) =>
      chain(() => docs.find((d) => d._id === key) || null),
    find: (filter: Record<string, unknown>) =>
      chain(() => docs.filter((d) => matches(d, filter))),
    countDocuments: (filter: Record<string, unknown>) =>
      chain(() => docs.filter((d) => matches(d, filter)).length),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown> },
    ) =>
      chain(() => {
        const doc = docs.find((d) => matches(d, filter));
        if (!doc) return null;
        Object.assign(doc, update.$set);
        return doc;
      }),
    distinct: (field: string, filter: Record<string, unknown>) =>
      chain(() => [
        ...new Set(docs.filter((d) => matches(d, filter)).map((d) => d[field])),
      ]),
    findByIdAndDelete: (key: string) =>
      chain(() => {
        const i = docs.findIndex((d) => d._id === key);
        return i >= 0 ? docs.splice(i, 1)[0] : null;
      }),
  };
}

function makeCounterModel() {
  const seqs = new Map<string, number>();
  return {
    findOneAndUpdate: (filter: { companyId: string }) =>
      chain(() => {
        const seq = (seqs.get(filter.companyId) || 0) + 1;
        seqs.set(filter.companyId, seq);
        return { companyId: filter.companyId, seq };
      }),
  };
}

const PROJECTS = [
  {
    _id: "p1",
    name: "Bygg A",
    companyId: "c1",
    ownerId: "boss",
    projectManagerId: "pm",
    projectAdmins: ["pa"],
    workers: ["w1", "w2"],
  },
  {
    _id: "p2",
    name: "Bygg B",
    companyId: "c1",
    ownerId: "boss",
    projectAdmins: [],
    workers: ["w9"],
  },
];

const USERS = [
  {
    _id: "admin",
    name: "Admin",
    companyId: "c1",
    role: UserRole.CompanyAdmin,
    language: { nb: "Norsk" },
  },
  { _id: "boss", name: "Eier", companyId: "c1", role: UserRole.ProjectAdmin },
  {
    _id: "pm",
    name: "Leder",
    companyId: "c1",
    role: UserRole.ProjectAdmin,
    language: { en: "English" },
  },
  {
    _id: "pa",
    name: "Per Prosjekt",
    companyId: "c1",
    role: UserRole.ProjectAdmin,
  },
  {
    _id: "w1",
    name: "Ola",
    companyId: "c1",
    role: UserRole.Worker,
    language: { nb: "Norsk" },
  },
  { _id: "w2", name: "Kari", companyId: "c1", role: UserRole.Worker },
  { _id: "other", name: "Fremmed", companyId: "c2", role: UserRole.Worker },
];

function setup(companyPlan: string | null = "projekt") {
  const deviations = makeDeviationModel();
  const listModel = (rows: Record<string, any>[]) => ({
    findById: (key: string) =>
      chain(() => rows.find((r) => String(r._id) === String(key)) || null),
    find: (filter: Record<string, unknown>) =>
      chain(() =>
        rows.filter((r) =>
          matches(
            { ...r, _id: r._id },
            Object.fromEntries(
              Object.entries(filter).map(([k, v]) =>
                k === "_id" && v && typeof v === "object" ? [k, v] : [k, v],
              ),
            ),
          ),
        ),
      ),
  });
  const companies = {
    find: () => chain(() => [{ _id: "c1", plan: companyPlan }]),
    findById: () =>
      chain(() => ({
        _id: "c1",
        name: "Firma AS",
        country: "NO",
        plan: companyPlan,
      })),
  };
  const notifications = { sendToUsers: jest.fn(async () => ({ sent: 1 })) };
  const checklists = listModel([
    {
      _id: "cl1",
      companyId: "c1",
      projectId: "p1",
      title: "Stillas",
      category: "work_environment",
      items: [
        {
          text: "Rekkverk montert",
          comment: "Mangler på plan 2",
          reference: "",
          action: "",
        },
      ],
    },
  ]);
  const dagbok = listModel([
    {
      _id: "db1",
      companyId: "c1",
      projectId: "p1",
      deviations: "Strømbrudd\nVentet 2 t",
    },
  ]);
  const service = new DeviationsService(
    deviations as never,
    makeCounterModel() as never,
    listModel(PROJECTS) as never,
    companies as never,
    listModel(USERS) as never,
    checklists as never,
    dagbok as never,
    notifications as never,
  );
  return { service, deviations, notifications };
}

const actor = (userId: string, role: UserRole) => ({
  userId,
  role,
  companyId: "c1",
});
const ADMIN = actor("admin", UserRole.CompanyAdmin);
const PA = actor("pa", UserRole.ProjectAdmin);
const W1 = actor("w1", UserRole.Worker);
const W2 = actor("w2", UserRole.Worker);
const W9 = actor("w9", UserRole.Worker);

describe("DeviationsService", () => {
  it("numbers deviations per company, starting at 1", async () => {
    const { service } = setup();
    const a = await service.create({ projectId: "p1", title: "A" }, W1);
    const b = await service.create({ projectId: "p1", title: "B" }, ADMIN);
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a.status).toBe("open");
    expect(a.reportedByName).toBe("Ola");
    expect(a.history[0].action).toBe("created");
  });

  it("is gated by the package: no avvik module → 403", async () => {
    const { service } = setup("faktura");
    await expect(service.list(ADMIN)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("a worker reports only on own projects and cannot assign or set a due date", async () => {
    const { service } = setup();
    await expect(
      service.create({ projectId: "p2", title: "X" }, W1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const d = await service.create(
      {
        projectId: "p1",
        title: "X",
        responsibleUserId: "w2",
        dueDate: "2026-11-20",
      },
      W1,
    );
    expect(d.responsibleUserId).toBeNull();
    expect(d.dueDate).toBeNull();
    expect(d.canManage).toBe(false);
    expect(d.editableFields).toContain("description");
  });

  it("assigning notifies the responsible (deep link + «deviations» setting); report pings managers", async () => {
    process.env.DEVIATION_NEW_REPORT_PUSH = "true";
    const { service, notifications } = setup();
    await service.create(
      {
        projectId: "p1",
        title: "Rekkverk",
        responsibleUserId: "w1",
        dueDate: "2026-11-20",
      },
      PA,
    );
    const calls = notifications.sendToUsers.mock.calls as unknown as [
      string[],
      any,
    ][];
    const assigned = calls.find(
      ([, p]) => p.data.type === "deviation_assigned",
    );
    expect(assigned?.[0]).toEqual(["w1"]);
    expect(assigned?.[1]).toMatchObject({
      title: "Avvik #1 er tildelt deg",
      preferenceKey: "deviations",
      data: { screen: "Deviation", deviationId: "d1", projectId: "p1" },
    });
    const reported = calls
      .filter(([, p]) => p.data.type === "deviation_reported")
      .flatMap(([ids]) => ids);
    expect(reported).toEqual(expect.arrayContaining(["admin", "boss", "pm"]));
    expect(reported).not.toContain("pa"); // the actor
    expect(reported).not.toContain("w1"); // already got «assigned»
    delete process.env.DEVIATION_NEW_REPORT_PUSH;
  });

  it("«new deviation» broadcast is off by default (old apps can't mute it)", async () => {
    delete process.env.DEVIATION_NEW_REPORT_PUSH;
    const { service, notifications } = setup();
    await service.create(
      { projectId: "p1", title: "A", responsibleUserId: "w1" },
      PA,
    );
    const types = (
      notifications.sendToUsers.mock.calls as unknown as [string[], any][]
    ).map(([, p]) => p.data.type);
    expect(types).toEqual(["deviation_assigned"]);
  });

  it("invalid due date → 400; source must be on the same project", async () => {
    const { service } = setup();
    await expect(
      service.create(
        { projectId: "p1", title: "A", dueDate: "2026-02-31" },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const d = await service.create({ projectId: "p1", title: "A" }, ADMIN);
    await expect(
      service.update(String(d._id), { dueDate: "31.12.2026" }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        { projectId: "p2", title: "A", source: { type: "dagbok", id: "db1" } },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const ok = await service.create(
      { projectId: "p1", title: "A", source: { type: "dagbok", id: "db1" } },
      ADMIN,
    );
    expect(ok.source).toMatchObject({ type: "dagbok", id: "db1" });
  });

  it("deleting removes the photo files too (best effort)", async () => {
    const { service } = setup();
    const d = await service.create({ projectId: "p1", title: "A" }, W1);
    await service.addPhotos(
      String(d._id),
      [{ filename: "avvik-1.jpg", originalname: "a.jpg" }],
      W1,
    );
    unlinkMock.mockClear();
    unlinkMock.mockRejectedValueOnce(new Error("gone") as never);
    await expect(service.remove(String(d._id), ADMIN)).resolves.toEqual({
      deleted: true,
    });
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(String((unlinkMock.mock.calls[0] as unknown[])[0])).toMatch(
      /uploads\/deviation-photos\/avvik-1\.jpg$/,
    );
  });

  it("rejects a responsible from another company", async () => {
    const { service } = setup();
    await expect(
      service.create(
        { projectId: "p1", title: "X", responsibleUserId: "other" },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("workers see only their projects' deviations; filters + overdue work", async () => {
    const { service, deviations } = setup();
    await service.create(
      { projectId: "p1", title: "A", category: "hms" as never },
      ADMIN,
    );
    await service.create(
      { projectId: "p2", title: "B", category: "quality" as never },
      ADMIN,
    );
    deviations.docs[0].dueDate = new Date("2020-01-01T00:00:00Z");
    expect((await service.list(W1)).map((d) => d.title)).toEqual(["A"]);
    expect((await service.list(W9)).map((d) => d.title)).toEqual(["B"]);
    expect(
      (await service.list(ADMIN, { category: "quality" })).map((d) => d.title),
    ).toEqual(["B"]);
    const overdue = await service.list(ADMIN, { overdue: "true" });
    expect(overdue.map((d) => d.title)).toEqual(["A"]);
    expect(overdue[0].overdue).toBe(true);
    expect(await service.summary(ADMIN)).toEqual({
      open: 2,
      inProgress: 0,
      closed: 0,
      overdue: 1,
    });
  });

  it("responsible moves to in progress; cannot close; PUT can't close either", async () => {
    const { service } = setup();
    const d = await service.create(
      { projectId: "p1", title: "A", responsibleUserId: "w2" },
      ADMIN,
    );
    const id = String(d._id);
    const upd = await service.update(
      id,
      { status: "in_progress" as never, correctiveAction: "Montert" },
      W2,
    );
    expect(upd.status).toBe("in_progress");
    expect(upd.correctiveAction).toBe("Montert");
    await expect(
      service.update(id, { dueDate: "2026-12-01" }, W2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.close(id, { closingComment: "ok" }, W2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(id, { status: "closed" as never }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("a worker cannot touch someone else's deviation", async () => {
    const { service } = setup();
    const d = await service.create({ projectId: "p1", title: "A" }, W1);
    await expect(
      service.update(String(d._id), { title: "B" }, W2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const own = await service.update(String(d._id), { title: "B" }, W1);
    expect(own.title).toBe("B");
    expect(own.history.at(-1)).toMatchObject({
      action: "updated",
      changes: [{ field: "title", from: "A", to: "B" }],
    });
  });

  it("close needs a comment, logs it, and reopen brings it back", async () => {
    const { service } = setup();
    const d = await service.create({ projectId: "p1", title: "A" }, W1);
    const id = String(d._id);
    await expect(
      service.close(id, { closingComment: "  " }, PA),
    ).rejects.toBeInstanceOf(BadRequestException);
    const closed = await service.close(
      id,
      { closingComment: "Utbedret", correctiveAction: "Nytt rekkverk" },
      PA,
    );
    expect(closed).toMatchObject({
      status: "closed",
      closingComment: "Utbedret",
      closedByName: "Per Prosjekt",
      correctiveAction: "Nytt rekkverk",
    });
    expect(closed.history.at(-1)?.action).toBe("closed");
    await expect(
      service.close(id, { closingComment: "igjen" }, PA),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(id, { title: "Z" }, W1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.reopen(id, {}, W1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const reopened = await service.reopen(
      id,
      { comment: "Ikke ferdig" },
      ADMIN,
    );
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.history.at(-1)).toMatchObject({
      action: "reopened",
      comment: "Ikke ferdig",
    });
  });

  it("only a company admin deletes", async () => {
    const { service, deviations } = setup();
    const d = await service.create({ projectId: "p1", title: "A" }, W1);
    await expect(service.remove(String(d._id), PA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.remove(String(d._id), ADMIN);
    expect(deviations.docs).toHaveLength(0);
  });

  it("prefills from a checklist remark and a dagbok avvik", async () => {
    const { service } = setup();
    expect(
      await service.prefill(W1, { checklistId: "cl1", itemIndex: "0" }),
    ).toMatchObject({
      projectId: "p1",
      title: "Rekkverk montert",
      description: "Mangler på plan 2",
      category: "hms",
      source: { type: "checklist", id: "cl1", itemIndex: 0 },
    });
    expect(await service.prefill(W1, { dagbokId: "db1" })).toMatchObject({
      title: "Strømbrudd",
      description: "Strømbrudd\nVentet 2 t",
      source: { type: "dagbok", id: "db1" },
    });
    await expect(
      service.prefill(W9, { dagbokId: "db1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reminders: due soon to the responsible, overdue once", async () => {
    const { service, deviations, notifications } = setup();
    await service.create(
      {
        projectId: "p1",
        title: "Snart",
        responsibleUserId: "w1",
        dueDate: "2026-11-11",
      },
      ADMIN,
    );
    await service.create(
      {
        projectId: "p1",
        title: "Sent",
        responsibleUserId: "w2",
        dueDate: "2026-11-01",
      },
      ADMIN,
    );
    await service.create(
      { projectId: "p1", title: "Ferdig", dueDate: "2026-11-01" },
      ADMIN,
    );
    deviations.docs[2].status = "closed";
    notifications.sendToUsers.mockClear();
    const now = new Date("2026-11-10T06:00:00Z");
    expect(await service.processReminders(now)).toEqual({
      dueSoon: 1,
      overdue: 1,
    });
    const types = (
      notifications.sendToUsers.mock.calls as unknown as [string[], any][]
    ).map(([ids, p]) => `${p.data.type}:${ids.join(",")}`);
    expect(types).toEqual(["deviation_due_soon:w1", "deviation_overdue:w2"]);
    expect(await service.processReminders(now)).toEqual({
      dueSoon: 0,
      overdue: 0,
    });
  });

  it("reminders: a reminder claimed by another server is not sent twice", async () => {
    const { service, deviations, notifications } = setup();
    await service.create(
      {
        projectId: "p1",
        title: "Sent",
        responsibleUserId: "w2",
        dueDate: "2026-11-01",
      },
      ADMIN,
    );
    notifications.sendToUsers.mockClear();
    const realFind = deviations.find;
    // The other instance claims it between our find and our claim.
    deviations.find = (filter: Record<string, unknown>) => {
      const q = realFind(filter);
      const exec = q.exec as () => Promise<Record<string, any>[]>;
      q.exec = async () => {
        const rows = await exec();
        rows.forEach((r) => (r.overdueNotifiedAt = new Date()));
        return rows;
      };
      return q;
    };
    expect(
      await service.processReminders(new Date("2026-11-10T06:00:00Z")),
    ).toEqual({
      dueSoon: 0,
      overdue: 0,
    });
    expect(notifications.sendToUsers).not.toHaveBeenCalled();
  });

  it("reminders skip companies whose plan has no avvik", async () => {
    const { service, deviations, notifications } = setup();
    await service.create(
      {
        projectId: "p1",
        title: "Sent",
        responsibleUserId: "w2",
        dueDate: "2026-11-01",
      },
      ADMIN,
    );
    (service as any).companies.find = () =>
      chain(() => [{ _id: "c1", plan: "faktura" }]);
    notifications.sendToUsers.mockClear();
    expect(
      await service.processReminders(new Date("2026-11-10T06:00:00Z")),
    ).toEqual({
      dueSoon: 0,
      overdue: 0,
    });
    expect(deviations.docs[0].overdueNotifiedAt).toBeNull();
  });
});
