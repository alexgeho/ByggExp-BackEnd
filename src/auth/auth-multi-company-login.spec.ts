import * as bcrypt from "bcrypt";

import { AuthService } from "./auth.service";

// Email is unique PER COMPANY, so a worker who changed employer can hold two
// separate accounts with the SAME email (one per company). Login must return the
// account whose password matches, not an arbitrary one.
describe("AuthService login across companies (email unique per company)", () => {
  const makeUser = async (
    id: string,
    companyId: string,
    name: string,
    plainPassword: string,
  ) => {
    const password = await bcrypt.hash(plainPassword, 10);
    return {
      _id: { toString: () => id },
      id,
      email: "worker@example.com",
      name,
      role: "worker",
      companyId,
      accountStatus: "active",
      password,
      toObject() {
        return {
          _id: this._id,
          id,
          email: this.email,
          name,
          role: "worker",
          companyId,
          accountStatus: "active",
          password,
        };
      },
    };
  };

  const makeService = (candidates: unknown[]) =>
    new AuthService(
      {
        findAllByEmail: async () => candidates,
        logActivity: async () => undefined,
      } as any,
      {} as any,
      { sign: () => "token" } as any,
      {} as any, // mailService
      { get: () => undefined } as any, // configService
      {} as any, // pendingRegistrationModel
    );

  it("logs into the company whose password matches", async () => {
    const agry = await makeUser("a1", "agry", "Agry account", "agryPass");
    const geal = await makeUser("g1", "geal", "Geal account", "gealPass");
    const auth = makeService([agry, geal]);

    const res: any = await auth.login("worker@example.com", "gealPass");

    expect(res.user.id).toBe("g1");
    expect(res.user.companyId).toBe("geal");
  });

  it("still resolves when the matching account is not first in the list", async () => {
    const agry = await makeUser("a1", "agry", "Agry account", "agryPass");
    const geal = await makeUser("g1", "geal", "Geal account", "gealPass");
    const auth = makeService([geal, agry]);

    const res: any = await auth.login("worker@example.com", "agryPass");

    expect(res.user.id).toBe("a1");
    expect(res.user.companyId).toBe("agry");
  });

  it("rejects when the password matches no account for that email", async () => {
    const agry = await makeUser("a1", "agry", "Agry account", "agryPass");
    const auth = makeService([agry]);

    await expect(auth.login("worker@example.com", "wrongPass")).rejects.toThrow();
  });
});
