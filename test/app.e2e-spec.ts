import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "./../src/app.module";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // AppModule pulls in ScheduleModule (cron timers) and an open Mongoose
  // connection. Without closing the app those keep the event loop alive, so
  // jest never exits and the CI job hangs until GitHub's 6h timeout kills it —
  // which fails the deploy. Close it so the process drains cleanly.
  afterEach(async () => {
    await app?.close();
  });

  it("/ (GET)", () => {
    return request(app.getHttpServer())
      .get("/")
      .expect(200)
      .expect("Hello World!");
  });
});
