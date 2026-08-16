// Must be first: loads .env with override before any module reads the env.
import "./load-env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AllExceptionsFilter } from "./filtres/exception.filter";
import { NullJsonBodyInterceptor } from "./common/interceptors/null-json-body.interceptor";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import express from "express";

async function bootstrap() {
  // rawBody is needed to verify Stripe webhook signatures.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Avoid 304 + empty body on repeat API requests (breaks fetch/axios clients).
  app.getHttpAdapter().getInstance().set("etag", false);
  const uploadsDir = join(process.cwd(), "uploads", "project-documents");
  const taskUploadsDir = join(process.cwd(), "uploads", "task-documents");
  const shiftUploadsDir = join(process.cwd(), "uploads", "shift-photos");
  const avatarUploadsDir = join(process.cwd(), "uploads", "user-avatars");
  const userDocumentsDir = join(process.cwd(), "uploads", "user-documents");
  const toolPhotosDir = join(process.cwd(), "uploads", "tool-photos");
  const bugReportsDir = join(process.cwd(), "uploads", "bug-reports");
  const chatAttachmentsDir = join(process.cwd(), "uploads", "chat-attachments");

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  if (!existsSync(taskUploadsDir)) {
    mkdirSync(taskUploadsDir, { recursive: true });
  }

  if (!existsSync(shiftUploadsDir)) {
    mkdirSync(shiftUploadsDir, { recursive: true });
  }

  if (!existsSync(avatarUploadsDir)) {
    mkdirSync(avatarUploadsDir, { recursive: true });
  }

  if (!existsSync(userDocumentsDir)) {
    mkdirSync(userDocumentsDir, { recursive: true });
  }

  if (!existsSync(toolPhotosDir)) {
    mkdirSync(toolPhotosDir, { recursive: true });
  }

  if (!existsSync(bugReportsDir)) {
    mkdirSync(bugReportsDir, { recursive: true });
  }

  if (!existsSync(chatAttachmentsDir)) {
    mkdirSync(chatAttachmentsDir, { recursive: true });
  }

  const logger = new Logger("Bootstrap");
  app.useLogger(logger);

  // Make the active environment + database obvious, and REFUSE TO START when a
  // non-production process is pointed at the production database — so local
  // development and tests can never silently write to real customer data.
  // Escape hatch: set ALLOW_PROD_DB=true to intentionally run against prod
  // (e.g. a one-off migration/cleanup script).
  const dbName =
    (process.env.MONGODB_URI || "").split("/").pop()?.split("?")[0] || "unknown";
  const nodeEnv = process.env.NODE_ENV || "development";
  logger.log(`Environment: ${nodeEnv} | Database: ${dbName}`);
  const looksLikeProdDb =
    /byggexp/i.test(dbName) && !/dev|stag|test|local/i.test(dbName);
  const allowProdDb = process.env.ALLOW_PROD_DB === "true";
  if (nodeEnv !== "production" && looksLikeProdDb && !allowProdDb) {
    logger.error(
      `🛑  Refusing to start: a non-production process (NODE_ENV="${nodeEnv}") is pointed at what looks like the PRODUCTION database ("${dbName}"). ` +
        `Point local development at a separate database (e.g. "${dbName}_dev"), or set ALLOW_PROD_DB=true if this is intentional.`,
    );
    process.exit(1);
  }

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new NullJsonBodyInterceptor());
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  app.use((req, res, next) => {
    logger.log(`${req.method} ${req.url}`);
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://localhost:4000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://185.189.51.128:8080",
    "https://bygghub.nu",
    "https://www.bygghub.nu",
    "https://byggexp.se",
    "https://www.byggexp.se",
    "https://tot-bygghub-admin-site.vercel.app",
    "http://localhost:8081",
    "https://admin.byggexp.se",
    // Web/PWA build of the mobile app (custom domain, if mapped later).
    "https://app.byggexp.se",
    // The API's own origin: server-rendered pages (password reset, registration
    // confirmation) POST back here, and the browser sends Origin: <api host> on
    // those same-origin form submits. Without this the CORS check rejects them.
    "https://api.byggexp.se",
    (process.env.API_PUBLIC_URL || "").replace(/\/$/, ""),
    ...extraOrigins,
  ].filter(Boolean));

  const allowedOriginPatterns = [
    /^exp:\/\/(?:localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/,
    // EAS Hosting for the ByggExp web/PWA build only: the production alias
    // (byggexp.expo.app) plus preview deploys (byggexp--<hash>.expo.app).
    // Scoped to this project's slug so other *.expo.app sites are not allowed.
    /^https:\/\/byggexp(?:--[a-z0-9-]+)?\.expo\.app$/,
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // Native mobile requests may omit Origin entirely; Expo dev can also use exp:// origins.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.has(origin) ||
        allowedOriginPatterns.some((pattern) => pattern.test(origin))
      ) {
        callback(null, true);
        return;
      }

      // Deny by omitting CORS headers (browser blocks it) instead of throwing —
      // a thrown Error here surfaces as a 500 for the caller, which turned
      // legitimate same-origin form posts into "unexpected error" pages.
      callback(null, false);
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server started on port ${port}`);
}
bootstrap();
