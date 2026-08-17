/**
 * Multi-tenant isolation e2e tests.
 *
 * Proves that a user from Company B can never read, mutate or delete
 * Company A's data (and that own-company access still works). This is the
 * acceptance gate for the SaaS multi-tenancy work — a regression here means a
 * customer could see another customer's data.
 *
 * Requires a reachable MongoDB. In CI provide one via a `mongodb` service and
 * set TEST_MONGODB_URI; locally it defaults to a throwaway local database that
 * is dropped after the run. It NEVER touches the production database.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://localhost:27017/byggexp_e2e_isolation";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import mongoose from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";

describe("Tenant isolation (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;

  // Filled during setup.
  let tokenA = "";
  let tokenB = "";
  let companyIdA = "";
  let adminIdA = "";
  let projectIdA = "";

  const uniq = Date.now();
  const superEmail = `super-${uniq}@e2e.local`;
  const adminAEmail = `admina-${uniq}@e2e.local`;
  const adminBEmail = `adminb-${uniq}@e2e.local`;
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

    // --- bootstrap platform superadmin (allowed once) ---
    await request(http)
      .post("/auth/register-superadmin")
      .send({ email: superEmail, password: PASS, name: "Super" });
    const superLogin = await request(http)
      .post("/auth/login")
      .send({ email: superEmail, password: PASS });
    const superToken = superLogin.body.access_token;

    // --- two isolated tenants ---
    await request(http)
      .post("/company/register")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        name: "CompanyA",
        address: "A",
        email: `a-${uniq}@e2e.local`,
        adminName: "AdminA",
        adminEmail: adminAEmail,
        adminPassword: PASS,
      });
    await request(http)
      .post("/company/register")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        name: "CompanyB",
        address: "B",
        email: `b-${uniq}@e2e.local`,
        adminName: "AdminB",
        adminEmail: adminBEmail,
        adminPassword: PASS,
      });

    const loginA = await request(http)
      .post("/auth/login")
      .send({ email: adminAEmail, password: PASS });
    tokenA = loginA.body.access_token;
    companyIdA = loginA.body.user.companyId;
    adminIdA = loginA.body.user.id;

    const loginB = await request(http)
      .post("/auth/login")
      .send({ email: adminBEmail, password: PASS });
    tokenB = loginB.body.access_token;

    const projectA = await request(http)
      .post("/projects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "A-Secret-Project", status: "planning" });
    projectIdA = projectA.body._id || projectA.body.id;
  });

  afterAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI as string);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch {
      /* ignore cleanup errors */
    }
    await app?.close();
  });

  it("setup produced two tenants and a project", () => {
    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
    expect(projectIdA).toBeTruthy();
  });

  describe("Company B cannot reach Company A's project", () => {
    it("GET /projects/:id -> 403", () =>
      request(http)
        .get(`/projects/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(403));

    it("GET /projects/info/:id -> 403", () =>
      request(http)
        .get(`/projects/info/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(403));

    it("GET /projects/:id/populated -> 403", () =>
      request(http)
        .get(`/projects/${projectIdA}/populated`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(403));

    it("PUT /projects/:id -> 403", () =>
      request(http)
        .put(`/projects/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ name: "hacked" })
        .expect(403));

    it("DELETE /projects/:id -> 403", () =>
      request(http)
        .delete(`/projects/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(403));

    it("GET /projects/populated excludes A", async () => {
      const res = await request(http)
        .get("/projects/populated")
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(projectIdA);
    });

    it("GET /projects/my/populated excludes A", async () => {
      const res = await request(http)
        .get("/projects/my/populated")
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(projectIdA);
    });

    it("POST /projects/by-ids excludes A", async () => {
      const res = await request(http)
        .post("/projects/by-ids")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ ids: [projectIdA] })
        .expect(201);
      expect(JSON.stringify(res.body)).not.toContain(projectIdA);
    });
  });

  describe("Company B cannot reach Company A's users/company", () => {
    it("GET /users/company/:companyIdA does not leak A users", async () => {
      const res = await request(http)
        .get(`/users/company/${companyIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(adminAEmail);
    });

    it("POST /users/by-ids excludes A admin", async () => {
      const res = await request(http)
        .post("/users/by-ids")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ ids: [adminIdA] })
        .expect(201);
      expect(JSON.stringify(res.body)).not.toContain(adminAEmail);
    });

    it("GET /company/:id -> 403", () =>
      request(http)
        .get(`/company/${companyIdA}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(403));

    it("POST /chats/direct to A admin -> 403", () =>
      request(http)
        .post("/chats/direct")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ participantId: adminIdA })
        .expect(403));
  });

  describe("Own-company access still works", () => {
    it("A GET /projects/:id -> 200", () =>
      request(http)
        .get(`/projects/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200));

    it("A PUT /projects/:id -> 200", () =>
      request(http)
        .put(`/projects/${projectIdA}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "A-Renamed" })
        .expect(200));
  });

  describe("Privilege-escalation is blocked", () => {
    it("public /auth/register cannot self-assign superadmin", async () => {
      const res = await request(http)
        .post("/auth/register")
        .send({
          email: `esc-${uniq}@e2e.local`,
          password: PASS,
          role: "superadmin",
          companyId: companyIdA,
        });
      const user = res.body.user || {};
      expect(user.role).toBe("worker");
      expect(user.companyId).toBeFalsy();
    });
  });
});
