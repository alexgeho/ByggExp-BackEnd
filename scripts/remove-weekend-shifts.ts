import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Removes weekend shifts (Saturday/Sunday) so the Hours grid shows no weekend work.
// Run:  DRY=1 npx ts-node scripts/remove-weekend-shifts.ts   (preview)
//       DRY=0 npx ts-node scripts/remove-weekend-shifts.ts   (apply)

const DRY = process.env.DRY !== '0';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// shiftDate is a 'YYYY-MM-DD' string; parse as UTC midnight for a stable weekday.
function weekday(shiftDate: string): number {
  return new Date(`${shiftDate}T00:00:00Z`).getUTCDay(); // 0=Sun ... 6=Sat
}

async function main() {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const shifts = db.collection('shifts');

  const all = await shifts.find({}).toArray();
  const weekend = all.filter((s) => {
    const d = weekday(String(s.shiftDate));
    return d === 0 || d === 6;
  });

  console.log(`${DRY ? '[DRY RUN] ' : ''}Weekend shifts to remove: ${weekend.length}\n`);
  for (const s of weekend) {
    console.log(`${s.shiftDate}  ${DOW[weekday(String(s.shiftDate))]}  worker=${String(s.workerId).slice(-6)}  ${s._id}`);
  }

  if (DRY) {
    console.log('\n[DRY RUN] nothing deleted. Re-run with DRY=0 to apply.');
    await mongoose.disconnect();
    return;
  }

  if (weekend.length) {
    const backupPath = join(
      __dirname,
      `weekend-shift-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(backupPath, JSON.stringify(weekend, null, 2));
    console.log(`\nBacked up ${weekend.length} shifts → ${backupPath}`);

    const ids = weekend.map((s) => s._id);
    const res = await shifts.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${res.deletedCount} weekend shifts.`);
  } else {
    console.log('Nothing to delete.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
