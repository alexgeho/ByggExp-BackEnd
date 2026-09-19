/**
 * Invite → create-password activation e2e.
 *
 * Proves the unified onboarding flow end to end: an admin invites a user, the
 * user sets a password on the verify-email page, and that single email+password
 * then signs them in on the SAME /auth/login the web admin and the mobile app
 * both use. Also covers: the GET verify-email page is prefetch-safe (idempotent,
 * no state change — matters because email preview bots hit it), the invite token
 * is single-use on submit, and the 6-digit code login works as a passwordless
 * fallback.
 *
 * The outbound email is intercepted with a mock MailService (like a fake SMTP /
 * Mailhog in a real pipeline) so the test can read the invite token + login code
 * straight from the "sent" mail instead of a real inbox.
 *
 * Requires a reachable MongoDB. Uses a throwaway local database and NEVER
 * touches production data.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  `mongodb://localhost:27017/byggexp_e2e_invite_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getConnectionToken } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { MailService } from "./../src/mail/mail.service";

// Records every outbound email call; any method returns a resolved promise so
// nothing in the flow breaks when it "sends".
type MailCall = { method: string; args: any[] };

describe("Invite → create-password activation (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let connection: Connection;
  let superToken = "";
  let companyId = "";

  const mailCalls: MailCall[] = [];
  const mailMock: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return undefined; // not a thenable
        return (...args: any[]) => {
          mailCalls.push({ method: String(prop), args });
          return Promise.resolve();
        };
      },
    },
  );

  const uniq = Date.now();
  const superEmail = `super-inv-${uniq}@e2e.local`;
  const companyEmail = `acme-inv-${uniq}@e2e.local`;
  const workerEmail = `worker-${uniq}@e2e.local`;
  const SUPER_PASS = "Password123456";
  const WORKER_PASS = "WorkerPass123456";

  const lastMail = (method: string): MailCall | undefined =>
    [...mailCalls].reverse().find((c) => c.method === method);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    http = app.getHttpServer();
    connection = app.get<Connection>(getConnectionToken());

    await request(http)
      .post("/auth/register-superadmin")
      .send({ email: superEmail, password: SUPER_PASS, name: "Super" });
    const superLogin = await request(http)
      .post("/auth/login")
      .send({ email: superEmail, password: SUPER_PASS });
    superToken = superLogin.body.access_token;
    expect(superToken).toBeTruthy();

    // A company to invite the worker into.
    const company = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email: companyEmail });
    companyId = String(company.body.company._id ?? company.body.company.id);
    expect(companyId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    try {
      await connection?.dropDatabase();
    } catch {
      // best-effort cleanup of the throwaway DB
    }
    await app?.close();
  }, 60000);

  let inviteToken = "";

  it("invites a worker (no password) and emails an invite link", async () => {
    const res = await request(http)
      .post("/users")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        email: workerEmail,
        name: "Test Worker",
        role: "worker",
        companyId,
        inviteViaEmail: true,
      });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    // Created pending, with no plaintext password ever returned.
    expect(res.body.password).toBeUndefined();

    const invite = lastMail("sendUserInviteEmail");
    expect(invite).toBeDefined();
    // sendUserInviteEmail(email, name, token, roleLabel, lang) — token is args[2]
    expect(invite!.args[0]).toBe(workerEmail);
    inviteToken = invite!.args[2];
    expect(typeof inviteToken).toBe("string");
    expect(inviteToken.length).toBeGreaterThan(10);
  });

  it("cannot log in yet — no password was ever set", async () => {
    const res = await request(http)
      .post("/auth/login")
      .send({ email: workerEmail, password: WORKER_PASS });
    expect(res.status).toBe(401);
  });

  it("GET /auth/verify-email shows the create-password form and is prefetch-safe", async () => {
    // Called twice to prove it's idempotent (email preview bots hit this GET
    // before the user clicks) — it must NOT consume the token or change state.
    const first = await request(http)
      .get("/auth/verify-email")
      .query({ token: inviteToken });
    expect(first.status).toBe(200);
    expect(first.text).toContain("/auth/verify-email/set-password");

    const second = await request(http)
      .get("/auth/verify-email")
      .query({ token: inviteToken });
    expect(second.status).toBe(200);
    expect(second.text).toContain("/auth/verify-email/set-password");
  });

  it("POST set-password activates the account and hands off a magic sign-in", async () => {
    const res = await request(http)
      .post("/auth/verify-email/set-password")
      .send({ token: inviteToken, password: WORKER_PASS });
    expect(res.status).toBe(200);
    // Worker → app deep-link page (magicRedirectHtml → /app/magic).
    expect(res.text).toContain("/app/magic");
  });

  it("now signs in with email + password on the shared /auth/login (web AND app)", async () => {
    const res = await request(http)
      .post("/auth/login")
      .send({ email: workerEmail, password: WORKER_PASS });
    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.user.email).toBe(workerEmail);
    expect(res.body.user.role).toBe("worker");
  });

  it("the invite token is single-use once submitted", async () => {
    const res = await request(http)
      .post("/auth/verify-email/set-password")
      .send({ token: inviteToken, password: "AnotherPass123456" });
    expect(res.status).toBe(400);
  });

  it("6-digit code login works as a passwordless fallback", async () => {
    const req = await request(http)
      .post("/auth/request-code")
      .send({ email: workerEmail });
    expect(req.status).toBe(201);

    const codeMail = lastMail("sendLoginCodeEmail");
    expect(codeMail).toBeDefined();
    // sendLoginCodeEmail(email, name, code, lang) — code is args[2]
    const code = codeMail!.args[2];
    expect(String(code)).toMatch(/^\d{6}$/);

    const login = await request(http)
      .post("/auth/code-login")
      .send({ email: workerEmail, code });
    expect(login.status).toBe(201);
    expect(login.body.access_token).toBeTruthy();
  });
});
