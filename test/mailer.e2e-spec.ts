/**
 * Newsletter mailer e2e: list import → campaign → sender → tracking →
 * unsubscribe, against a real MongoDB (TEST_MONGODB_URI in CI).
 *
 * SMTP points at a closed local port, so the sender must pause the campaign
 * with a readable error instead of burning through the list; tracking and
 * unsubscribe are exercised through the public endpoints with the real tokens.
 */
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI_MAILER ||
  (process.env.TEST_MONGODB_URI
    ? process.env.TEST_MONGODB_URI.replace(
        /\/[^/?]+(\?|$)/,
        "/byggexp_e2e_mailer$1",
      )
    : "mongodb://localhost:27017/byggexp_e2e_mailer");
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e_test_secret";
process.env.DISABLE_CRONS = "true"; // the test drives the sender itself

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import mongoose, { Model } from "mongoose";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { signLink } from "./../src/mailer/mailer-crypto";
import { MailerCampaignsService } from "./../src/mailer/mailer-campaigns.service";
import {
  CampaignRecipient,
  CampaignRecipientDocument,
} from "./../src/mailer/schemas/mailer.schemas";

describe("Mailer (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let token = "";
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const uniq = Date.now();
  const PASS = "Password123456";

  let listId = "";
  let campaignId = "";

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

    const email = `super-${uniq}@e2e.local`;
    await request(http)
      .post("/auth/register-superadmin")
      .send({ email, password: PASS, name: "Super" });
    const login = await request(http)
      .post("/auth/login")
      .send({ email, password: PASS });
    token = login.body.access_token;
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

  it("is superadmin-only", async () => {
    expect(token).toBeTruthy();
    await request(http).get("/mailer/lists").expect(401);
  });

  it("imports a list, skipping invalid and duplicate rows", async () => {
    const list = await request(http)
      .post("/mailer/lists")
      .set(auth())
      .send({ name: "Stockholm" })
      .expect(201);
    listId = list.body._id;
    const res = await request(http)
      .post(`/mailer/lists/${listId}/import`)
      .set(auth())
      .send({
        rows: [
          { email: "Lars@Ekomiljo.se", name: "Lars", company: "Ekomiljö" },
          { email: "info@fahlensbygg.se" },
          { email: "info@nvbs.se" },
          { email: "not-an-email" },
          { email: "lars@ekomiljo.se" },
        ],
      })
      .expect(201);
    expect(res.body).toMatchObject({ added: 3, invalid: 1, duplicates: 1 });

    const lists = await request(http)
      .get("/mailer/lists")
      .set(auth())
      .expect(200);
    expect(lists.body[0]).toMatchObject({
      name: "Stockholm",
      total: 3,
      active: 3,
    });

    const subs = await request(http)
      .get(`/mailer/subscribers?listId=${listId}&search=ekomiljo`)
      .set(auth())
      .expect(200);
    expect(subs.body.total).toBe(1);
    expect(subs.body.items[0]).toMatchObject({
      email: "lars@ekomiljo.se",
      name: "Lars",
      status: "active",
    });
  });

  it("refuses to start without SMTP settings, then sends until SMTP fails and pauses", async () => {
    const nl = await request(http)
      .post("/newsletters")
      .set(auth())
      .send({})
      .expect(201);
    const camp = await request(http)
      .post("/mailer/campaigns")
      .set(auth())
      .send({ name: "Sept", newsletterId: nl.body._id, listId })
      .expect(201);
    campaignId = camp.body._id;
    expect(camp.body.subject).toBe(
      "Mer tid på bygget – mindre vid skrivbordet",
    );

    await request(http)
      .post(`/mailer/campaigns/${campaignId}/start`)
      .set(auth())
      .send({})
      .expect(400);

    const settings = await request(http)
      .put("/mailer/settings")
      .set(auth())
      .send({
        smtpHost: "127.0.0.1",
        smtpPort: 1,
        smtpUser: "u",
        smtpPass: "secret",
        fromEmail: "news@e2e.local",
      })
      .expect(200);
    expect(settings.body).toMatchObject({
      configured: true,
      hasPassword: true,
    });
    expect(JSON.stringify(settings.body)).not.toContain("secret");

    const started = await request(http)
      .post(`/mailer/campaigns/${campaignId}/start`)
      .set(auth())
      .send({})
      .expect(201);
    expect(started.body.status).toBe("sending");
    expect(started.body.stats.total).toBe(3);

    await app.get(MailerCampaignsService).processQueue();
    const after = await request(http)
      .get(`/mailer/campaigns/${campaignId}`)
      .set(auth())
      .expect(200);
    expect(after.body.status).toBe("paused");
    expect(after.body.lastError).toMatch(/SMTP/);
    expect(after.body.stats.sent).toBe(0);
  });

  it("tracks opens and signed clicks, and one-click unsubscribes everywhere", async () => {
    const recipients = app.get<Model<CampaignRecipientDocument>>(
      getModelToken(CampaignRecipient.name),
    );
    const r = await recipients.findOne({ email: "lars@ekomiljo.se" }).lean();
    expect(r).toBeTruthy();
    const t = r!.token;

    const pixel = await request(http).get(`/m/o/${t}.gif`).expect(200);
    expect(pixel.headers["content-type"]).toContain("image/gif");

    const url = "https://byggexp.se/sv/contact";
    await request(http)
      .get(`/m/c/${t}`)
      .query({ u: url, s: "forged" })
      .expect(400);
    const click = await request(http)
      .get(`/m/c/${t}`)
      .query({ u: url, s: signLink(t, url) })
      .expect(302);
    expect(click.headers.location).toBe(url);

    // GET only shows a confirmation page (link scanners must not unsubscribe).
    await request(http).get(`/m/u/${t}`).expect(200);
    let subs = await request(http)
      .get(`/mailer/subscribers?listId=${listId}&search=ekomiljo`)
      .set(auth());
    expect(subs.body.items[0].status).toBe("active");

    await request(http)
      .post(`/m/u/${t}`)
      .type("form")
      .send({ "List-Unsubscribe": "One-Click" })
      .expect(200);
    subs = await request(http)
      .get(`/mailer/subscribers?listId=${listId}&search=ekomiljo`)
      .set(auth());
    expect(subs.body.items[0].status).toBe("unsubscribed");

    // Re-importing the address into another list keeps it blocked.
    const other = await request(http)
      .post("/mailer/lists")
      .set(auth())
      .send({ name: "Göteborg" });
    const re = await request(http)
      .post(`/mailer/lists/${other.body._id}/import`)
      .set(auth())
      .send({ rows: [{ email: "lars@ekomiljo.se" }] });
    expect(re.body).toMatchObject({ added: 1, suppressed: 1 });

    const camp = await request(http)
      .get(`/mailer/campaigns/${campaignId}`)
      .set(auth());
    expect(camp.body.stats).toMatchObject({
      opened: 1,
      clicked: 1,
      unsubscribed: 1,
    });

    const events = await request(http)
      .get(`/mailer/events?campaignId=${campaignId}`)
      .set(auth())
      .expect(200);
    const types = events.body.items.map((e: { type: string }) => e.type).sort();
    expect(types).toEqual(["click", "open", "unsubscribe"]);
  });
});
