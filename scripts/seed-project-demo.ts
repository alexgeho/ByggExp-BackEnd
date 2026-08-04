import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Demo seeding for the "Byggnation av BRF Peter" project (video shoot):
//   1. Planned = flat 8h  (HourAdjustment, grid-only, no mobile impact)
//   2. Payment plan (Betalningsplan) with realistic à conto milestones
//   3. Realistic project tasks assigned across the crew (junk tasks removed)
// GPS shifts are left exactly as they are.
//
// Run:  DRY=1 npx ts-node scripts/seed-project-demo.ts   (preview)
//       DRY=0 npx ts-node scripts/seed-project-demo.ts   (apply)

const DRY = process.env.DRY !== '0';
const PID = '6a6624b511e14c117d0f9491';
const COMPANY = '6a6621b011e14c117d0f9275';
const GEAL = '6a66220211e14c117d0f92cd'; // owner / project manager
const YEAR = 2026;
const WEEKS = [28, 29, 30, 31];
const CONTRACT = 1200000;

function mondayOfIsoWeek(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const w1 = new Date(jan4);
  w1.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const mon = new Date(w1);
  mon.setUTCDate(w1.getUTCDate() + (week - 1) * 7);
  return mon;
}
const d = (iso: string) => new Date(`${iso}T09:00:00+02:00`);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const adjCol = db.collection('houradjustments');
  const ppCol = db.collection('paymentplans');
  const taskCol = db.collection('tasks');
  const usersCol = db.collection('users');

  // Crew (worker / projectAdmin of the main company).
  const users = await usersCol
    .find({ companyId: COMPANY })
    .project({ name: 1, role: 1, profession: 1 })
    .toArray();
  const crew = users.filter((u) => u.role === 'worker' || u.role === 'projectAdmin');
  const byName = (n: string) => crew.find((u) => (u.name || '').startsWith(n));
  console.log('Crew:', crew.map((u) => `${u.name} (${u.role})`).join(', '));

  // Planned=8 only for crew who actually have GPS shifts on this project, so
  // Planned lines up with GPS (workers with no shifts stay empty, not "planned
  // but never showed up").
  const shiftWorkerIds = new Set(
    (await db.collection('shifts').find({ projectId: PID }).project({ workerId: 1 }).toArray()).map(
      (s) => String(s.workerId),
    ),
  );
  const plannedCrew = crew.filter((u) => shiftWorkerIds.has(String(u._id)));
  console.log('Planned=8 for:', plannedCrew.map((u) => u.name).join(', '));

  // ---- 1. Planned = 8 adjustments ----
  const dates: string[] = [];
  for (const w of WEEKS) {
    const mon = mondayOfIsoWeek(w, YEAR);
    for (let i = 0; i < 5; i++) {
      const dd = new Date(mon);
      dd.setUTCDate(mon.getUTCDate() + i);
      dates.push(dd.toISOString().slice(0, 10));
    }
  }
  const now = new Date(`${YEAR}-08-03T09:00:00+02:00`);
  const adjustments = plannedCrew.flatMap((u) =>
    dates.map((date) => ({
      companyId: COMPANY,
      projectId: PID,
      workerId: String(u._id),
      date,
      plannedHours: 8,
      originalPlannedHours: 8, // planned === orig → no "edited" badge
      updatedByUserId: GEAL,
      note: '',
      createdAt: now,
      updatedAt: now,
    })),
  );

  // ---- 2. Payment plan rows ----
  const rows = [
    { description: 'Etapp 1 – Grundläggning & platta', percent: 20, amount: 240000, plannedDate: '2026-07-10', status: 'invoiced', invoiceNumber: 1001, note: '' },
    { description: 'Etapp 2 – Stomme & bjälklag', percent: 25, amount: 300000, plannedDate: '2026-08-20', status: 'planned', invoiceNumber: null, note: '' },
    { description: 'Etapp 3 – Tak & fasad', percent: 20, amount: 240000, plannedDate: '2026-09-20', status: 'planned', invoiceNumber: null, note: '' },
    { description: 'Etapp 4 – Installationer (VVS/El) & inredning', percent: 20, amount: 240000, plannedDate: '2026-10-20', status: 'planned', invoiceNumber: null, note: '' },
    { description: 'Slutbesiktning & slutfaktura', percent: 15, amount: 180000, plannedDate: '2026-11-20', status: 'planned', invoiceNumber: null, note: '' },
  ];

  // ---- 3. Tasks ----
  const junkTitles = ['diag test WITH dates (safe to delete)', 'Put water ON'];
  const mk = (
    title: string,
    who: string | null,
    priority: 'low' | 'normal' | 'high',
    start: string | null,
    due: string | null,
    status: 'open' | 'completed',
    desc = '',
  ) => {
    const u = who ? byName(who) : null;
    const base: any = {
      projectId: PID,
      assigneeUserId: u ? String(u._id) : null,
      assigneeUserName: u ? u.name : '',
      createdByUserId: GEAL,
      taskTitle: title,
      taskDescription: desc,
      notes: '',
      documents: [],
      startDate: start ? d(start) : null,
      dueDate: due ? d(due) : null,
      status,
      priority,
      completedAt: status === 'completed' ? d(due || start || '2026-07-20') : null,
      completedByUserId: status === 'completed' ? (u ? String(u._id) : GEAL) : null,
      createdAt: start ? d(start) : now,
      updatedAt: now,
    };
    return base;
  };
  const newTasks = [
    mk('Gjutning av grundplatta', 'Denis', 'high', '2026-07-06', '2026-07-10', 'completed', 'Formsättning, armering och gjutning av bottenplatta.'),
    mk('Resning av stomme plan 1–2', 'Roger', 'high', '2026-07-13', '2026-07-24', 'open', 'Montering av prefab-element och bjälklag.'),
    mk('Skyddsrond & egenkontroll v.30', 'Andreas', 'normal', '2026-07-20', '2026-07-24', 'completed', 'Veckans skyddsrond och dokumenterad egenkontroll.'),
    mk('Montering av yttertak', 'Antony', 'normal', '2026-07-27', '2026-08-07', 'open', 'Takstolar, underlagstak och plåtarbete.'),
    mk('Beställ fönster (leverans v.33)', 'Tomas', 'normal', '2026-07-20', '2026-07-31', 'open', 'Beställning enligt fönsterlista, leverans vecka 33.'),
    mk('Slutbesiktning – boka besiktningsman', 'Hadjie', 'low', '2026-11-01', '2026-11-15', 'open', 'Boka oberoende besiktningsman inför slutbesiktning.'),
  ];

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Plan:`);
  console.log(`  Adjustments: delete existing for project, insert ${adjustments.length} (flat 8h, weeks ${WEEKS.join(',')})`);
  console.log(`  Payment plan: set contract ${CONTRACT.toLocaleString('sv-SE')} + ${rows.length} rows`);
  rows.forEach((r) => console.log(`     ${r.percent}%  ${r.amount.toLocaleString('sv-SE')}  ${r.plannedDate}  ${r.status}  ${r.description}`));
  console.log(`  Tasks: delete ${junkTitles.length} junk, insert ${newTasks.length} realistic`);
  newTasks.forEach((t) => console.log(`     [${t.status}] ${t.priority.padEnd(6)} ${t.assigneeUserName || '—'} · ${t.taskTitle}`));

  if (DRY) {
    console.log('\n[DRY RUN] nothing written. Re-run with DRY=0 to apply.');
    await mongoose.disconnect();
    return;
  }

  // Backup everything we touch.
  const [oldAdj, oldPP, oldTasks] = await Promise.all([
    adjCol.find({ projectId: PID }).toArray(),
    ppCol.find({ projectId: PID }).toArray(),
    taskCol.find({ projectId: PID }).toArray(),
  ]);
  const backup = join(__dirname, `project-demo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(backup, JSON.stringify({ adjustments: oldAdj, paymentPlans: oldPP, tasks: oldTasks }, null, 2));
  console.log(`\nBacked up (adj:${oldAdj.length} pp:${oldPP.length} tasks:${oldTasks.length}) → ${backup}`);

  // 1. Adjustments
  await adjCol.deleteMany({ projectId: PID });
  await adjCol.insertMany(adjustments);
  console.log(`Adjustments: reset → ${adjustments.length} @ 8h.`);

  // 2. Payment plan (update existing if present, else create)
  const existingPP = oldPP[0];
  if (existingPP) {
    await ppCol.updateOne(
      { _id: existingPP._id },
      { $set: { name: 'Betalningsplan', contractAmount: CONTRACT, rows, notes: 'Betalningsplan enligt entreprenadkontrakt.', updatedAt: now } },
    );
    console.log('Payment plan: updated existing.');
  } else {
    await ppCol.insertOne({ companyId: COMPANY, projectId: PID, name: 'Betalningsplan', contractAmount: CONTRACT, rows, notes: 'Betalningsplan enligt entreprenadkontrakt.', createdByUserId: GEAL, createdAt: now, updatedAt: now });
    console.log('Payment plan: created.');
  }

  // 3. Tasks
  const del = await taskCol.deleteMany({ projectId: PID, taskTitle: { $in: junkTitles } });
  await taskCol.insertMany(newTasks);
  console.log(`Tasks: deleted ${del.deletedCount} junk, inserted ${newTasks.length}.`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
