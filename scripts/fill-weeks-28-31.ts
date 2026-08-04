import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Fills ISO weeks 28-31 (2026) Mon-Fri with clean ~8.5-9h GPS shifts for the
// main company's crew, on the visible project. Rebuilds those workers' shifts
// from scratch and removes orphan-worker shifts (no user doc → "Unknown" rows).
//
// Run:  DRY=1 npx ts-node scripts/fill-weeks-28-31.ts   (preview)
//       DRY=0 npx ts-node scripts/fill-weeks-28-31.ts   (apply)

const DRY = process.env.DRY !== '0';
const MS_PER_HOUR = 3600 * 1000;
const YEAR = 2026;
const WEEKS = [28, 29, 30, 31];
const MAIN_COMPANY = '6a6621b011e14c117d0f9275';
const CANONICAL_PROJECT_ID = '6a6624b511e14c117d0f9491';
const CANONICAL_PROJECT_NAME = 'Byggnation av BRF Peter';

function mondayOfIsoWeek(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  return mon;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

async function main() {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const shiftsCol = db.collection('shifts');
  const usersCol = db.collection('users');

  const allShifts = await shiftsCol.find({}).toArray();
  const workerIds = [...new Set(allShifts.map((s) => String(s.workerId)))];

  const users = await usersCol
    .find({ _id: { $in: workerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .project({ name: 1, role: 1, companyId: 1 })
    .toArray();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  // Roster = billable crew of the main company (worker / projectAdmin), who
  // already appear in shifts. These are the rows the Hours grid shows.
  const roster = users
    .filter(
      (u) =>
        (u.role === 'worker' || u.role === 'projectAdmin') &&
        String(u.companyId) === MAIN_COMPANY,
    )
    .map((u) => ({ id: String(u._id), name: u.name as string }));

  // Orphan workers = shift.workerId with no user doc → show as "Unknown".
  const orphanIds = workerIds.filter((id) => !userById.has(id));

  console.log('=== Roster to fill (main company crew) ===');
  roster.forEach((r) => console.log(`  ${r.id.slice(-6)}  ${r.name}`));
  console.log(`\nOrphan workers to delete (Unknown rows): ${orphanIds.map((i) => i.slice(-6)).join(', ') || 'none'}`);

  // Build the Mon-Fri date list for the target weeks.
  const dates: string[] = [];
  for (const w of WEEKS) {
    const mon = mondayOfIsoWeek(w, YEAR);
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon);
      d.setUTCDate(mon.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  console.log(`\nFilling ${dates.length} weekdays × ${roster.length} workers = ${dates.length * roster.length} shifts`);
  console.log(`Weeks ${WEEKS.join(', ')}: ${dates[0]} … ${dates[dates.length - 1]}\n`);

  // Shifts to delete: everything by roster workers (rebuild clean) + orphans.
  const rosterSet = new Set(roster.map((r) => r.id));
  const toDelete = allShifts.filter(
    (s) => rosterSet.has(String(s.workerId)) || orphanIds.includes(String(s.workerId)),
  );

  // Build the fresh shift docs.
  const newShifts: any[] = [];
  let sampleShown = 0;
  for (const r of roster) {
    for (const date of dates) {
      const seed = `${r.id}|${date}`;
      const startMin = hash(seed) % 41; // 0..40 min after 07:00
      const hours = 8.5 + (hash(seed + '#h') % 31) / 60; // 8.5 .. 9.0
      const start = new Date(`${date}T07:${String(startMin).padStart(2, '0')}:00.000+02:00`);
      const durationMs = Math.round(hours * MS_PER_HOUR);
      const end = new Date(start.getTime() + durationMs);

      if (sampleShown < 8) {
        console.log(
          `  ${date}  ${r.name.padEnd(24)} ${hours.toFixed(2)}h  ${start
            .toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}`,
        );
        sampleShown++;
      }

      newShifts.push({
        workerId: r.id,
        projectId: CANONICAL_PROJECT_ID,
        projectNameSnapshot: CANONICAL_PROJECT_NAME,
        locationSnapshot: '',
        shiftDate: date,
        startedAt: start,
        endedAt: end,
        lastResumedAt: null,
        status: 'completed',
        autoPausedReason: '',
        segments: [{ startedAt: start, endedAt: end, durationMs }],
        durationMs,
        completionReason: 'admin_seed',
        completionSource: 'admin',
        completionNotifiedAt: null,
        photos: [],
        createdAt: start,
        updatedAt: end,
      });
    }
  }
  console.log('  …');

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Would delete ${toDelete.length} existing shifts, insert ${newShifts.length} new.`);

  if (DRY) {
    console.log('\n[DRY RUN] nothing written. Re-run with DRY=0 to apply.');
    await mongoose.disconnect();
    return;
  }

  const backupPath = join(
    __dirname,
    `fill-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(backupPath, JSON.stringify(allShifts, null, 2));
  console.log(`\nBacked up ALL ${allShifts.length} shifts → ${backupPath}`);

  if (toDelete.length) {
    const res = await shiftsCol.deleteMany({ _id: { $in: toDelete.map((s) => s._id) } });
    console.log(`Deleted ${res.deletedCount} shifts (roster rebuild + orphans).`);
  }
  const ins = await shiftsCol.insertMany(newShifts);
  console.log(`Inserted ${ins.insertedCount} new shifts.`);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
