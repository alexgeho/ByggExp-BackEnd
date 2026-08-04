import { config } from 'dotenv';
config();
import mongoose from 'mongoose';

// Opens ACTIVE shifts dated today for crew whose workStatus is 'working', so the
// dashboard shows live "in shift" time (People at work / Hours today / per-worker
// Today's hours) instead of 0. Banked durationMs = elapsed since morning start so
// the summary tile shows hours; lastResumedAt = now so live keeps ticking up
// without double counting.
//
// Run:  DRY=1 npx ts-node scripts/start-today-shifts.ts   (preview)
//       DRY=0 npx ts-node scripts/start-today-shifts.ts   (apply)

const DRY = process.env.DRY !== '0';
const COMPANY = '6a6621b011e14c117d0f9275';
const PID = '6a6624b511e14c117d0f9491';
const PROJECT_NAME = 'Byggnation av BRF Peter';
const TODAY = '2026-08-03';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const shiftsCol = db.collection('shifts');
  const usersCol = db.collection('users');

  const working = await usersCol
    .find({ companyId: COMPANY, role: { $in: ['worker', 'projectAdmin'] }, workStatus: 'working' })
    .project({ name: 1 })
    .toArray();

  const nowMs = Date.now();
  const now = new Date(nowMs);

  // Remove any pre-existing active shift for these workers (avoid the unique
  // active-per-worker index conflict) — safe, they're being re-opened.
  const ids = working.map((u) => String(u._id));
  const existingActive = await shiftsCol
    .find({ workerId: { $in: ids }, status: { $in: ['active', 'paused'] } })
    .toArray();

  const docs = working.map((u, i) => {
    const start = new Date(`${TODAY}T07:${String(i * 7).padStart(2, '0')}:00+02:00`);
    const banked = Math.max(0, nowMs - start.getTime());
    const h = Math.floor(banked / 3600000);
    const m = Math.floor((banked % 3600000) / 60000);
    return {
      doc: {
        workerId: String(u._id),
        projectId: PID,
        projectNameSnapshot: PROJECT_NAME,
        locationSnapshot: '',
        shiftDate: TODAY,
        startedAt: start,
        lastResumedAt: now, // live = banked + (now - lastResumedAt) ⇒ ticks from banked
        status: 'active',
        autoPausedReason: '',
        segments: [{ startedAt: start, durationMs: banked }],
        durationMs: banked,
        completionReason: '',
        completionSource: '',
        completionNotifiedAt: null,
        photos: [],
        createdAt: start,
        updatedAt: now,
      },
      label: `${u.name}  start ${start.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}  → ${h}h ${m}m`,
    };
  });

  console.log(`${DRY ? '[DRY RUN] ' : ''}Now: ${now.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`);
  console.log(`Opening ${docs.length} active shifts (removing ${existingActive.length} stale active first):\n`);
  docs.forEach((d) => console.log('  ' + d.label));

  if (DRY) {
    console.log('\n[DRY RUN] nothing written. Re-run with DRY=0 to apply.');
    await mongoose.disconnect();
    return;
  }

  if (existingActive.length) {
    await shiftsCol.deleteMany({ _id: { $in: existingActive.map((s) => s._id) } });
  }
  const res = await shiftsCol.insertMany(docs.map((d) => d.doc));
  console.log(`\nInserted ${res.insertedCount} active shifts.`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
