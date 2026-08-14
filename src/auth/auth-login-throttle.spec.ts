import { AuthService } from "./auth.service";

// The login brute-force limiter locks an email after MAX_LOGIN_ATTEMPTS (8)
// failures, then rejects further attempts with HTTP 429.
describe("AuthService login throttling", () => {
  const makeService = () =>
    new AuthService(
      { findAllByEmail: async () => [] } as any, // always "invalid credentials"
      {} as any,
      {} as any,
      {} as any, // mailService
      { get: () => undefined } as any, // configService
      {} as any, // pendingRegistrationModel
    );

  const statusOf = async (fn: () => Promise<unknown>): Promise<number> => {
    try {
      await fn();
      return 0;
    } catch (error: any) {
      return typeof error?.getStatus === "function" ? error.getStatus() : -1;
    }
  };

  it("returns 401 for the first 8 failures, then 429", async () => {
    const auth = makeService();
    const email = "attacker@example.com";

    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await statusOf(() => auth.login(email, "wrong"))).toBe(401);
    }
    // 9th attempt is locked out.
    expect(await statusOf(() => auth.login(email, "wrong"))).toBe(429);
    expect(await statusOf(() => auth.login(email, "wrong"))).toBe(429);
  });

  it("keeps different emails independent", async () => {
    const auth = makeService();
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await statusOf(() => auth.login("locked@example.com", "wrong"));
    }
    expect(await statusOf(() => auth.login("locked@example.com", "wrong"))).toBe(429);
    // A different account is unaffected.
    expect(await statusOf(() => auth.login("someone-else@example.com", "wrong"))).toBe(401);
  });
});
