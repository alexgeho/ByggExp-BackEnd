/**
 * Manual hours belong to the worker (decision 2026-10-25): a manager can't
 * overwrite hours the worker already logged for a day — changes happen only
 * later, at payroll. The worker can still correct their own day.
 *
 * Runs against a throwaway database (TEST_MONGODB_URI or a local default) —
 * never production.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://localhost:27017/byggexp_e2e_manual_hours_owner";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getConnectionToken } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";

describe("Manual hours: only the worker changes their day (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let db: Connection;
  let adminToken = "";
  let workerToken = "";
  let projectId = "";
  let workerId = "";

  const uniq = Date.now();
  const PASS = "Password123456";
  const HOUR = 3600000;

  const log = (token: string, date: string, hours: number) =>
    request(http)
      .post("/shifts/manual")
      .set("Authorization", `Bearer ${token}`)
      .send({ workerId, projectId, date, durationMs: hours * HOUR });

  const storedHours = async (date: string) => {
    const shift = await db.db
      ?.collection("shifts")
      .findOne({ shiftDate: date });
    return (shift?.manualDurationMs ?? 0) / HOUR;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    http = app.getHttpServer();
    db = app.get<Connection>(getConnectionToken());
    // A leftover superadmin from an aborted run blocks registering a new one.
    await db.db?.dropDatabase();

    const superEmail = `super-${uniq}@e2e.local`;
    await request(http)
      .post("/auth/register-superadmin")
      .send({ email: superEmail, password: PASS, name: "Super" });
    const superToken = (
      await request(http).post("/auth/login").send({ email: superEmail, password: PASS })
    ).body.access_token;

    const adminEmail = `admin-${uniq}@e2e.local`;
    await request(http)
      .post("/company/register")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        name: "Bygg AB",
        address: "Byggvägen 1",
        email: `bygg-${uniq}@e2e.local`,
        adminName: "Chef",
        adminEmail,
        adminPassword: PASS,
      });
    adminToken = (
      await request(http).post("/auth/login").send({ email: adminEmail, password: PASS })
    ).body.access_token;

    const workerEmail = `worker-${uniq}@e2e.local`;
    const worker = await request(http)
      .post("/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: workerEmail, password: PASS, name: "Adam", role: "worker" });
    workerId = worker.body._id || worker.body.id;
    workerToken = (
      await request(http).post("/auth/login").send({ email: workerEmail, password: PASS })
    ).body.access_token;

    const project = await request(http)
      .post("/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Nacka",
        status: "planning",
        beginningDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      });
    projectId = project.body._id || project.body.id;

    await request(http)
      .post(`/projects/${projectId}/workers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ workerIds: [workerId] });
  }, 60000);

  afterAll(async () => {
    await db.db?.dropDatabase().catch(() => undefined);
    await app?.close();
  });

  it("the worker logs their day", async () => {
    expect((await log(workerToken, "2026-10-20", 8)).status).toBe(201);
    expect(await storedHours("2026-10-20")).toBe(8);
  });

  it("the manager can't overwrite it — hours stay as the worker wrote", async () => {
    expect((await log(adminToken, "2026-10-20", 5)).status).toBe(403);
    expect(await storedHours("2026-10-20")).toBe(8);
  });

  it("the worker can still correct their own day", async () => {
    expect((await log(workerToken, "2026-10-20", 7)).status).toBe(201);
    expect(await storedHours("2026-10-20")).toBe(7);
  });
});
