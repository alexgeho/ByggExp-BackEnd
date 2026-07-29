/**
 * Seeds a development / staging database with a self-contained demo company:
 * one company admin, a few workers (with hourly rates), two projects with a
 * work schedule and assigned crews, and some tasks. Safe to re-run — it removes
 * its own previously seeded records (tagged with SEED_TAG) first.
 *
 * Run:  npm run seed:demo
 *
 * SAFETY: refuses to touch a database whose name looks like production
 * (contains "byggexp" without a dev/staging/test marker) unless SEED_FORCE=1.
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { MONGODB_URI } from './load-env';

const SEED_TAG = 'demo-seed';
const COMPANY_EMAIL = 'demo@byggexp.dev';
const ADMIN_EMAIL = 'admin@byggexp.dev';
const DEMO_PASSWORD = 'demo1234';

const dbName = (MONGODB_URI.split('/').pop() || '').split('?')[0];
const looksLikeProd = /byggexp/i.test(dbName) && !/dev|stg|stag|test|local/i.test(dbName);
if (looksLikeProd && process.env.SEED_FORCE !== '1') {
  // eslint-disable-next-line no-console
  console.error(
    `\n✋ Refusing to seed database "${dbName}" — it looks like PRODUCTION.\n` +
      `   Point MONGODB_URI at a *_dev / *_stg database, or set SEED_FORCE=1 to override.\n`,
  );
  process.exit(1);
}

const d = (offsetDays: number): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
};

const SCHEDULE = {
  enabled: true,
  workDayStartTime: '07:00',
  workDayEndTime: '16:00',
  startGraceMinutes: 20,
  endGraceMinutes: 20,
  timezone: 'Europe/Stockholm',
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.log(`Connected to "${dbName}". Seeding demo data…`);

  const opts = { strict: false, timestamps: true };
  const loose = (name: string, collection: string): mongoose.Model<any> =>
    (mongoose.models[name] as mongoose.Model<any>)
    || mongoose.model<any>(name, new mongoose.Schema({}, opts), collection);
  const Company = loose('Company', 'companies');
  const User = loose('User', 'users');
  const Project = loose('Project', 'projects');
  const Task = loose('Task', 'tasks');

  // Idempotent: clear anything a previous run of THIS seed created.
  const existingCompany = await Company.findOne({ email: COMPANY_EMAIL });
  if (existingCompany) {
    const companyId = String(existingCompany._id);
    await Promise.all([
      User.deleteMany({ companyId, seedTag: SEED_TAG }),
      Project.deleteMany({ companyId, seedTag: SEED_TAG }),
      Task.deleteMany({ seedTag: SEED_TAG }),
    ]);
    await Company.deleteOne({ _id: existingCompany._id });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const company = await Company.create({
    name: 'Demo Bygg AB',
    email: COMPANY_EMAIL,
    orgNumber: '556000-0000',
    address: 'Byggvägen 1, Stockholm',
    seedTag: SEED_TAG,
  });
  const companyId = String(company._id);

  const mkUser = (email: string, name: string, role: string, extra: Record<string, unknown> = {}) => ({
    email,
    password: passwordHash,
    name,
    role,
    companyId,
    accountStatus: 'active',
    workStatus: 'off_duty',
    seedTag: SEED_TAG,
    ...extra,
  });

  const admin = await User.create(
    mkUser(ADMIN_EMAIL, 'Demo Admin', 'companyAdmin', { profession: 'Platschef' }),
  );
  const adminId = String(admin._id);

  const workers = await User.insertMany([
    mkUser('worker1@byggexp.dev', 'Erik Andersson', 'worker', { profession: 'Snickare', hourlyRate: 320 }),
    mkUser('worker2@byggexp.dev', 'Johan Nilsson', 'worker', { profession: 'Elektriker', hourlyRate: 360 }),
    mkUser('worker3@byggexp.dev', 'Karl Svensson', 'worker', { profession: 'Betongarbetare', hourlyRate: 300 }),
  ]);
  const workerIds = workers.map((w) => String(w._id));

  const projectsSpec = [
    {
      name: 'Villa Solsidan – nybyggnad',
      status: 'in_progress',
      beginningDate: d(-30),
      endDate: d(60),
      budget: 2_400_000,
      plannedHours: 1800,
      plannedMaterialsCost: 900_000,
      location: 'Solsidan 12, Nacka',
      crew: workerIds.slice(0, 2),
    },
    {
      name: 'Lgh-renovering Vasastan',
      status: 'planning',
      beginningDate: d(7),
      endDate: d(45),
      budget: 650_000,
      plannedHours: 520,
      plannedMaterialsCost: 240_000,
      location: 'Odengatan 3, Stockholm',
      crew: workerIds.slice(1, 3),
    },
  ];

  for (const spec of projectsSpec) {
    const project = await Project.create({
      companyId,
      ownerId: adminId,
      projectManagerId: adminId,
      projectAdmins: [],
      name: spec.name,
      status: spec.status,
      location: spec.location,
      beginningDate: spec.beginningDate,
      endDate: spec.endDate,
      budget: spec.budget,
      plannedHours: spec.plannedHours,
      plannedMaterialsCost: spec.plannedMaterialsCost,
      shiftSchedule: SCHEDULE,
      workers: spec.crew,
      tasks: [],
      seedTag: SEED_TAG,
    });

    const tasks = await Task.insertMany([
      {
        projectId: String(project._id),
        taskTitle: 'Rivning och sanering',
        startDate: spec.beginningDate,
        dueDate: d(-5),
        status: 'completed',
        assigneeUserId: spec.crew[0] || adminId,
        seedTag: SEED_TAG,
      },
      {
        projectId: String(project._id),
        taskTitle: 'Stomme och grund',
        startDate: d(2),
        dueDate: d(20),
        status: 'open',
        assigneeUserId: spec.crew[0] || adminId,
        seedTag: SEED_TAG,
      },
      {
        projectId: String(project._id),
        taskTitle: 'El och VVS',
        startDate: d(10),
        dueDate: d(35),
        status: 'open',
        assigneeUserId: spec.crew[1] || adminId,
        seedTag: SEED_TAG,
      },
    ]);

    project.set('tasks', tasks.map((t) => String(t._id)));
    await project.save();
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n✅ Seeded "${dbName}":\n` +
      `   Company: Demo Bygg AB\n` +
      `   Projects: ${projectsSpec.length}, Workers: ${workerIds.length}\n` +
      `   Login:  ${ADMIN_EMAIL}  /  ${DEMO_PASSWORD}  (companyAdmin)\n`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
