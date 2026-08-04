import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Normalizes runaway GPS shift durations for demo/video purposes.
// A "runaway" shift = worked >= THRESHOLD_H (ran past a normal workday because
// nobody stopped it, so it hit the next-morning auto-cutoff), or is still active.
// We keep the real start, and re-end it at start + ~8h so GPS reads realistically.
//
// Run:  DRY=1 npx ts-node scripts/normalize-shift-hours.ts   (preview, no writes)
//       DRY=0 npx ts-node scripts/normalize-shift-hours.ts   (apply)

const MS_PER_HOUR = 1000 * 60 * 60;
const THRESHOLD_H = 10; // anything longer than a normal workday
const DRY = process.env.DRY !== '0';

// Deterministic per-shift target between 7.5 and 8.5h, derived from the _id so
// the grid looks naturally varied (not every cell an identical 8,0).
function targetHours(id: string): number {
  const n = parseInt(id.slice(-4), 16) || 0;
  const frac = (n % 61) / 60; // 0..1
  return 7.5 + frac; // 7.5 .. 8.5
}

async function main() {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const shifts = db.collection('shifts');

  const now = Date.now();
  const all = await shifts.find({}).toArray();

  const worked = (s: any): number => {
    const banked = Number(s.durationMs) || 0;
    if (s.status !== 'active') return banked;
    const resumedAt = s.lastResumedAt || s.startedAt;
    if (!resumedAt) return banked;
    return banked + Math.max(0, now - new Date(resumedAt).getTime());
  };

  const targets = all.filter(
    (s) => s.status === 'active' || worked(s) / MS_PER_HOUR >= THRESHOLD_H,
  );

  // Back up everything we are about to touch (full documents) before writing.
  if (!DRY) {
    const backupPath = join(
      __dirname,
      `shift-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(backupPath, JSON.stringify(targets, null, 2));
    console.log(`Backed up ${targets.length} shifts → ${backupPath}\n`);
  }

  console.log(`${DRY ? '[DRY RUN] ' : ''}Normalizing ${targets.length} shifts:\n`);

  for (const s of targets) {
    const id = String(s._id);
    const start = new Date(s.startedAt);
    const tH = targetHours(id);
    const end = new Date(start.getTime() + tH * MS_PER_HOUR);
    const durationMs = Math.round(tH * MS_PER_HOUR);

    const beforeH = (worked(s) / MS_PER_HOUR).toFixed(1);
    console.log(
      `${s.shiftDate}  ${beforeH}h → ${tH.toFixed(1)}h   ${start
        .toTimeString()
        .slice(0, 5)}–${end.toTimeString().slice(0, 5)}  ${id}`,
    );

    if (DRY) continue;

    await shifts.updateOne(
      { _id: s._id },
      {
        $set: {
          status: 'completed',
          endedAt: end,
          durationMs,
          lastResumedAt: null,
          autoPausedReason: '',
          completionReason: 'admin_normalized',
          completionSource: 'admin',
          // Collapse to a single clean segment matching the new window.
          segments: [{ startedAt: start, endedAt: end, durationMs }],
        },
      },
    );
  }

  console.log(
    `\n${DRY ? '[DRY RUN] nothing written. Re-run with DRY=0 to apply.' : 'Done — shifts updated.'}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
