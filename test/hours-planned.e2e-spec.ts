/**
 * Planned hours on the Hours grid — the scenario from Maria (Geal, 2026-09-22):
 * a site created with a 07:00–16:00 day and an hour's lunch, running
 * 22 Sep → 30 Nov, with one worker on its team. Every working day in the
 * viewed month should carry 8 planned hours, and a correction typed into a
 * cell must come back on the next read.
 *
 * Runs against a throwaway database (TEST_MONGODB_URI or a local default) —
 * never production.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://localhost:27017/byggexp_e2e_hours_planned";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import mongoose from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";

describe("Hours grid: planned hours (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let token = "";
  let projectId = "";
  let workerId = "";

  const uniq = Date.now();
  const PASS = "Password123456";

  const grid = async () => {
    const res = await request(http)
      .get("/hours")
      .query({ projectId, from: "2026-09-01", to: "2026-09-30" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.workers.find((w: { workerId: string }) => w.workerId === workerId);
    return row?.cells || {};
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    http = app.getHttpServer();

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
        name: "Geal",
        address: "Byggmästarvägen 18",
        email: `geal-${uniq}@e2e.local`,
        adminName: "Roger",
        adminEmail,
        adminPassword: PASS,
      });
    token = (
      await request(http).post("/auth/login").send({ email: adminEmail, password: PASS })
    ).body.access_token;

    const worker = await request(http)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: `adam-${uniq}@e2e.local`, password: PASS, name: "Adam", role: "worker" });
    workerId = worker.body._id || worker.body.id;

    const project = await request(http)
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nacka",
        status: "planning",
        beginningDate: "2026-09-22T00:00:00.000Z",
        endDate: "2026-11-30T00:00:00.000Z",
        // Enforcement off, as it was on Maria's project.
        shiftSchedule: {
          enabled: false,
          workDayStartTime: "07:00",
          workDayEndTime: "16:00",
          lunchMinutes: 60,
        },
      });
    projectId = project.body._id || project.body.id;

    await request(http)
      .post(`/projects/${projectId}/workers`)
      .set("Authorization", `Bearer ${token}`)
      .send({ workerIds: [workerId] });
  }, 60000);

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase().catch(() => undefined);
    await app?.close();
  });

  it("plans 8 hours on every working day from the project start", async () => {
    expect(projectId).toBeTruthy();
    expect(workerId).toBeTruthy();
    const cells = await grid();
    for (const date of ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"]) {
      expect({ date, planned: cells[date]?.planned }).toEqual({ date, planned: 8 });
    }
    // Before the project starts and at weekends: no plan.
    expect(cells["2026-09-21"]?.planned ?? null).toBeNull();
    expect(cells["2026-09-26"]?.planned ?? null).toBeNull();
  });

  it("keeps a planned correction typed into a cell", async () => {
    const save = await request(http)
      .put("/hours/adjustment")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, workerId, date: "2026-09-30", plannedHours: 6 });
    expect(save.status).toBe(200);
    const cells = await grid();
    expect(cells["2026-09-30"]?.planned).toBe(6);
    expect(cells["2026-09-30"]?.edited).toBe(true);
  });

  it("gives a worker their own plan, and only their own row", async () => {
    const workerToken = (
      await request(http)
        .post("/auth/login")
        .send({ email: `adam-${uniq}@e2e.local`, password: PASS })
    ).body.access_token;
    const res = await request(http)
      .get("/hours")
      .query({ from: "2026-09-01", to: "2026-09-30" })
      .set("Authorization", `Bearer ${workerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.workers.map((w: { workerId: string }) => w.workerId)).toEqual([workerId]);
    const cells = res.body.workers[0].cells;
    expect(cells["2026-09-24"]?.planned).toBe(8);
    expect(cells["2026-09-29"]?.planned).toBe(8);
  });
});
