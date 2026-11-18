// A subcontractor's contact person must only ever reach its own firm and its
// own people. These specs pin the queries that enforce it.
import { SubcontractorsService } from "./subcontractors.service";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/schemas/user.schema";
import {
  getEffectivePermissions,
  PERMISSIONS,
} from "../common/permissions/permissions.constants";

const chainOf = (result: unknown) => {
  const chain: any = {
    sort: () => chain,
    select: () => chain,
    lean: () => chain,
    exec: () => Promise.resolve(result),
  };
  return chain;
};

describe("SubcontractorsService", () => {
  const build = (opts: { inviteFails?: boolean } = {}) => {
    const queries: any[] = [];
    const saved: any[] = [];
    const deleted: any[] = [];
    function Model(this: any, doc: any) {
      Object.assign(this, doc, { _id: "f".repeat(24) });
      this.save = () => {
        saved.push({ ...this });
        return Promise.resolve(this);
      };
      this.deleteOne = () => {
        deleted.push(this._id);
        return Promise.resolve();
      };
      this.toObject = () => ({ _id: this._id, name: this.name });
    }
    Model.find = (q: any) => {
      queries.push(["find", q]);
      return chainOf([]);
    };
    Model.findOne = (q: any) => {
      queries.push(["findOne", q]);
      return chainOf({ _id: q._id, name: "Måleri AB" });
    };
    const companyModel: any = {
      findById: () => chainOf({ name: "Geal Entreprenad AB" }),
    };
    const invites: any[] = [];
    const usersService: any = {
      findByEmailInCompany: () => Promise.resolve(null),
      createUserPendingApproval: (dto: any) => {
        invites.push(dto);
        return opts.inviteFails
          ? Promise.reject(new Error("Seat limit"))
          : Promise.resolve({ user: { _id: "u1" }, inviteEmailSent: true });
      },
    };
    const service = new SubcontractorsService(
      Model as any,
      {} as any,
      companyModel,
      usersService,
    );
    return { service, queries, saved, deleted, invites };
  };

  it("gives a subcontractor's contact only its own firm", async () => {
    const { service, queries } = build();
    const out = await service.findAll({
      role: UserRole.Subcontractor,
      companyId: "c1",
      subcontractorId: "s1",
    });
    expect(queries).toEqual([["findOne", { _id: "s1", companyId: "c1" }]]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ clientCompanyName: "Geal Entreprenad AB" });
  });

  it("gives nothing to a contact without a firm", async () => {
    const { service, queries } = build();
    expect(
      await service.findAll({ role: UserRole.Subcontractor, companyId: "c1" }),
    ).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("lists the company's firms for an admin", async () => {
    const { service, queries } = build();
    await service.findAll({ role: UserRole.CompanyAdmin, companyId: "c1" });
    expect(queries).toEqual([["find", { companyId: "c1" }]]);
  });

  it("invites the contact with the subcontractor role, tied to the firm", async () => {
    const { service, invites } = build();
    const out = await service.create(
      { name: "Måleri AB", email: "Mikael@Maleri.se", workType: "Målare" },
      { role: UserRole.CompanyAdmin, companyId: "c1", userId: "admin" },
    );
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      email: "mikael@maleri.se",
      role: UserRole.Subcontractor,
      companyId: "c1",
      subcontractorId: "f".repeat(24),
      profession: "Målare",
    });
    expect(out.inviteEmailSent).toBe(true);
  });

  it("does not keep a firm whose invitation failed", async () => {
    const { service, deleted } = build({ inviteFails: true });
    await expect(
      service.create(
        { name: "Måleri AB", email: "mikael@maleri.se" },
        { role: UserRole.CompanyAdmin, companyId: "c1" },
      ),
    ).rejects.toThrow("Seat limit");
    expect(deleted).toEqual(["f".repeat(24)]);
  });

  it("creates a firm without an invitation when no e-mail is given", async () => {
    const { service, invites } = build();
    const out = await service.create(
      { name: "El & Rör AB", email: "" },
      { role: UserRole.CompanyAdmin, companyId: "c1" },
    );
    expect(invites).toEqual([]);
    expect(out.inviteEmailSent).toBe(false);
  });
});

describe("UsersService — subcontractor scope", () => {
  const build = (existsResult: unknown = null) => {
    const finds: any[] = [];
    const exists: any[] = [];
    const userModel: any = {
      find: (q: any) => {
        finds.push(q);
        return chainOf([]);
      },
      exists: (q: any) => {
        exists.push(q);
        return { exec: () => Promise.resolve(existsResult) };
      },
    };
    const none: any = {};
    const service = new UsersService(
      userModel,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
    return { service, finds, exists };
  };

  it("lists only the firm's own people for its contact", async () => {
    const { service, finds } = build();
    await service.findManageableUsers({
      userId: "u1",
      role: UserRole.Subcontractor,
      companyId: "c1",
      subcontractorId: "s1",
    });
    expect(finds).toEqual([
      { companyId: "c1", subcontractorId: "s1", erasedAt: null },
    ]);
  });

  it("lists nobody for a contact without a firm", async () => {
    const { service, finds } = build();
    expect(
      await service.findManageableUsers({
        userId: "u1",
        role: UserRole.Subcontractor,
        companyId: "c1",
      }),
    ).toEqual([]);
    expect(finds).toEqual([]);
  });

  it("checks firm, company and worker role before a contact may touch a user", async () => {
    const { service, exists } = build(null);
    const allowed = await (service as any).canEditUser(
      {
        userId: "u1",
        role: UserRole.Subcontractor,
        companyId: "c1",
        subcontractorId: "s1",
      },
      { _id: "target", role: UserRole.Worker, companyId: "c1" },
    );
    expect(allowed).toBe(false);
    expect(exists).toEqual([
      {
        _id: "target",
        companyId: "c1",
        subcontractorId: "s1",
        role: UserRole.Worker,
        erasedAt: null,
      },
    ]);
  });

  it("lets a contact edit a worker of its own firm", async () => {
    const { service } = build({ _id: "target" });
    expect(
      await (service as any).canEditUser(
        {
          userId: "u1",
          role: UserRole.Subcontractor,
          companyId: "c1",
          subcontractorId: "s1",
        },
        { _id: "target", role: UserRole.Worker, companyId: "c1" },
      ),
    ).toBe(true);
  });
});

describe("subcontractor permissions", () => {
  it("has staff and hours capabilities, never finance or company ones", () => {
    const perms = getEffectivePermissions(UserRole.Subcontractor);
    expect(perms.has(PERMISSIONS.EMPLOYEES_MANAGE)).toBe(true);
    expect(perms.has(PERMISSIONS.SHIFTS_VIEW_ALL)).toBe(true);
    expect(perms.has(PERMISSIONS.FINANCE_MANAGE)).toBe(false);
    expect(perms.has(PERMISSIONS.PROJECTS_MANAGE)).toBe(false);
    expect(perms.has(PERMISSIONS.COMPANY_MANAGE)).toBe(false);
  });
});
