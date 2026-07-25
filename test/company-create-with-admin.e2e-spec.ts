/**
 * Company onboarding e2e: creating a company provisions its first Company Admin
 * from the company email, with an auto-generated password (emailed, never typed).
 *
 * Requires a reachable MongoDB. Uses a throwaway local database and NEVER
 * touches production data.
 */
// Unique throwaway DB per run => always empty (register-superadmin is
// bootstrap-only). NEVER touches production data.
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  `mongodb://localhost:27017/byggexp_e2e_company_${Date.now()}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_test_secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Company create + auto admin (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let connection: Connection;
  let superToken = '';

  const uniq = Date.now();
  const superEmail = `super-${uniq}@e2e.local`;
  const PASS = 'Password123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    http = app.getHttpServer();
    connection = app.get<Connection>(getConnectionToken());

    await request(http)
      .post('/auth/register-superadmin')
      .send({ email: superEmail, password: PASS, name: 'Super' });
    const superLogin = await request(http)
      .post('/auth/login')
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

  it('creates a company with ONLY an email and provisions a Company Admin', async () => {
    const email = `acme-${uniq}@e2e.local`;
    const res = await request(http)
      .post('/company')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email });

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    // company created with that email as login
    expect(res.body.company).toBeDefined();
    expect(res.body.company.email).toBe(email);

    // first admin auto-provisioned from the company email
    expect(res.body.admin).toBeDefined();
    expect(res.body.admin.email).toBe(email);
    expect(res.body.admin.role).toBe('companyAdmin');
    expect(String(res.body.admin.companyId)).toBe(
      String(res.body.company._id ?? res.body.company.id),
    );

    // no plaintext password ever returned to the caller
    expect(res.body.admin.password).toBeUndefined();
    // account starts pending; first password login activates it
    expect(res.body.admin.accountStatus).toBe('waiting_for_approval');
  });

  it('rejects a second company with the same email (409)', async () => {
    const email = `dup-${uniq}@e2e.local`;
    await request(http)
      .post('/company')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email })
      .expect((r) => expect(r.status).toBeLessThan(300));

    const res = await request(http)
      .post('/company')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email });
    expect(res.status).toBe(409);
  });

  it('requires an email', async () => {
    const res = await request(http)
      .post('/company')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'No Email Co' });
    expect(res.status).toBe(400);
  });

  it('is superadmin-only (a plain token cannot create companies)', async () => {
    const res = await request(http)
      .post('/company')
      .send({ email: `noauth-${uniq}@e2e.local` });
    expect(res.status).toBe(401);
  });
});
