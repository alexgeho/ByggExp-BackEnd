import { config } from 'dotenv';
config();
import mongoose from 'mongoose';

const MS_PER_HOUR = 1000 * 60 * 60;

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

  const rows = all
    .map((s) => ({
      id: String(s._id),
      date: s.shiftDate,
      worker: String(s.workerId),
      status: s.status,
      bankedH: (Number(s.durationMs) || 0) / MS_PER_HOUR,
      workedH: worked(s) / MS_PER_HOUR,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    }))
    .sort((a, b) => b.workedH - a.workedH);

  console.log(`Total shifts: ${all.length}`);
  console.log(`Active (still running): ${all.filter((s) => s.status === 'active').length}`);
  const longs = rows.filter((r) => r.workedH >= 10);
  console.log(`\nShifts >= 10h worked (GPS): ${longs.length}`);
  console.log('---------------------------------------------------------------');
  for (const r of longs.slice(0, 40)) {
    console.log(
      `${r.date}  ${r.status.padEnd(9)}  worked=${r.workedH.toFixed(1)}h  banked=${r.bankedH.toFixed(1)}h  worker=${r.worker.slice(-6)}  ${r.id}`,
    );
  }

  console.log('\nTop 10 overall:');
  for (const r of rows.slice(0, 10)) {
    console.log(`${r.date}  ${r.status}  worked=${r.workedH.toFixed(1)}h  start=${r.startedAt}  end=${r.endedAt}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
