/**
 * A worker adds documents, photos and tools to a project they work on
 * (Alexander, 2026-09-23) — and only to that project.
 *
 * Runs against a throwaway database (TEST_MONGODB_URI or a local default) —
 * never production.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://localhost:27017/byggexp_e2e_worker_content";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import mongoose from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";

describe("Worker adds content to their project (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let adminToken = "";
  let workerToken = "";
  let ownProject = "";
  let otherProject = "";
  let toolId = "";
  const uniq = Date.now();
  const PASS = "Password123456";

  const login = async (email: string) =>
    (await request(http).post("/auth/login").send({ email, password: PASS })).body.access_token;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    http = app.getHttpServer();

    const superEmail = `super-${uniq}@e2e.local`;
    await request(http).post("/auth/register-superadmin").send({ email: superEmail, password: PASS, name: "Super" });
    const superToken = await login(superEmail);
    const adminEmail = `admin-${uniq}@e2e.local`;
    await request(http)
      .post("/company/register")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ name: "Geal", address: "X 1", email: `geal-${uniq}@e2e.local`, adminName: "Roger", adminEmail, adminPassword: PASS });
    adminToken = await login(adminEmail);

    const workerEmail = `maria-${uniq}@e2e.local`;
    const worker = await request(http)
      .post("/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: workerEmail, password: PASS, name: "Maria", role: "worker" });
    const workerId = worker.body._id || worker.body.id;
    workerToken = await login(workerEmail);

    const mk = async (name: string) =>
      (await request(http).post("/projects").set("Authorization", `Bearer ${adminToken}`).send({ name, status: "planning" })).body._id;
    ownProject = await mk("Nacka");
    otherProject = await mk("Other");
    await request(http)
      .post(`/projects/${ownProject}/workers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ workerIds: [workerId] });

    const tool = await request(http)
      .post("/tools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Borrmaskin" });
    toolId = tool.body._id || tool.body.id;
  }, 60000);

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase().catch(() => undefined);
    await app?.close();
  });

  it("uploads a document/photo to their own project, not to another", async () => {
    const ok = await request(http)
      .post(`/projects/${ownProject}/documents`)
      .set("Authorization", `Bearer ${workerToken}`)
      .attach("documents", Buffer.from("fake-jpeg"), { filename: "site.jpg", contentType: "image/jpeg" });
    expect(ok.status).toBe(201);
    expect(ok.body.documents.some((d: { name: string }) => d.name === "site.jpg")).toBe(true);

    const denied = await request(http)
      .post(`/projects/${otherProject}/documents`)
      .set("Authorization", `Bearer ${workerToken}`)
      .attach("documents", Buffer.from("x"), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(denied.status).toBe(403);
  });

  it("sees the company's tools and attaches one to their own project only", async () => {
    const register = await request(http).get("/tools/register").set("Authorization", `Bearer ${workerToken}`);
    expect(register.status).toBe(200);
    expect(register.body.map((t: { _id: string }) => t._id)).toContain(toolId);

    const ok = await request(http)
      .post("/tools/attach-to-project")
      .set("Authorization", `Bearer ${workerToken}`)
      .send({ projectId: ownProject, toolIds: [toolId] });
    expect(ok.status).toBeLessThan(300);

    const denied = await request(http)
      .post("/tools/attach-to-project")
      .set("Authorization", `Bearer ${workerToken}`)
      .send({ projectId: otherProject, toolIds: [toolId] });
    expect(denied.status).toBe(403);
  });
});
