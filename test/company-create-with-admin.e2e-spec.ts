/**
 * Company onboarding e2e: creating a company emails an invite to the company
 * address; its first Company Admin is created only when the invite is accepted.
 *
 * Requires a reachable MongoDB. Uses a throwaway local database and NEVER
 * touches production data.
 */
// Unique throwaway DB per run => always empty (register-superadmin is
// bootstrap-only). NEVER touches production data.
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  `mongodb://localhost:27017/byggexp_e2e_company_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getConnectionToken } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";

describe("Company create + admin invite (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let connection: Connection;
  let superToken = "";

  const uniq = Date.now();
  const superEmail = `super-${uniq}@e2e.local`;
  const PASS = "Password123456";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    http = app.getHttpServer();
    connection = app.get<Connection>(getConnectionToken());

    await request(http)
      .post("/auth/register-superadmin")
      .send({ email: superEmail, password: PASS, name: "Super" });
    const superLogin = await request(http)
      .post("/auth/login")
      .send({ email: superEmail, password: PASS });
    superToken = superLogin.body.access_token;
    expect(superToken).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    try {
      await connection?.dropDatabase();
    } catch {
      // best-effort cleanup of the throwaway DB
    }
    await app.close();
  }, 60000);

  it("creates a company with ONLY an email and invites its admin (no user until acceptance)", async () => {
    const email = `acme-${uniq}@e2e.local`;
    const res = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email });

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    // company created with that email as login
    expect(res.body.company).toBeDefined();
    expect(res.body.company.email).toBe(email);
    expect(res.body.invited).toBe(true);
    // the admin account is created only when the invite is accepted
    expect(res.body.admin).toBeUndefined();

    const users = await connection
      .collection("users")
      .countDocuments({ email });
    expect(users).toBe(0);
    const invite = await connection
      .collection("companyinvites")
      .findOne({ email });
    expect(invite).toBeTruthy();
    expect(invite?.role).toBe("companyAdmin");
    expect(String(invite?.companyId)).toBe(
      String(res.body.company._id ?? res.body.company.id),
    );
  });

  it("rejects a second company with the same email (409)", async () => {
    const email = `dup-${uniq}@e2e.local`;
    await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email })
      .expect((r) => expect(r.status).toBeLessThan(300));

    const res = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email });
    expect(res.status).toBe(409);
  });

  it("requires an email", async () => {
    const res = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ name: "No Email Co" });
    expect(res.status).toBe(400);
  });

  it("is superadmin-only (a plain token cannot create companies)", async () => {
    const res = await request(http)
      .post("/company")
      .send({ email: `noauth-${uniq}@e2e.local` });
    expect(res.status).toBe(401);
  });

  it("deleting a company frees its email again (recreate works)", async () => {
    const email = `cascade-${uniq}@e2e.local`;

    // create → company + pending admin invite
    const created = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email });
    const companyId = created.body.company._id ?? created.body.company.id;

    // the company now owns the email (recreating it is blocked)
    const dup = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email });
    expect(dup.status).toBe(409);

    // delete the company
    const del = await request(http)
      .delete(`/company/${companyId}`)
      .set("Authorization", `Bearer ${superToken}`);
    expect(del.status).toBeGreaterThanOrEqual(200);
    expect(del.status).toBeLessThan(300);

    // now the same email is free again (nothing orphaned blocks it)
    const recreated = await request(http)
      .post("/company")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ email });
    expect(recreated.status).toBeGreaterThanOrEqual(200);
    expect(recreated.status).toBeLessThan(300);
    expect(recreated.body.company.email).toBe(email);
  });
});
