import { config } from 'dotenv';
config();
import mongoose from 'mongoose';

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((+date - +firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const shifts = await db
    .collection('shifts')
    .find({ projectId: '6a6624b511e14c117d0f9491' })
    .toArray();

  const users = await db.collection('users').find({}).project({ name: 1 }).toArray();
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  // worker → date → hours
  const byWorker = new Map<string, Map<string, number>>();
  for (const s of shifts) {
    const w = String(s.workerId);
    if (!byWorker.has(w)) byWorker.set(w, new Map());
    const d = byWorker.get(w)!;
    d.set(s.shiftDate, (d.get(s.shiftDate) || 0) + (Number(s.durationMs) || 0) / 3600000);
  }

  const dates = [...new Set(shifts.map((s) => s.shiftDate as string))].sort();
  console.log(`Project "Byggnation av BRF Peter" — ${shifts.length} shifts, ${dates.length} distinct days`);
  console.log(`Range: ${dates[0]} … ${dates[dates.length - 1]}\n`);

  // Per week totals per worker
  const weeks = [...new Set(dates.map((d) => isoWeek(new Date(`${d}T00:00:00Z`))))].sort((a, b) => a - b);
  console.log('Weekly totals per worker (h):');
  console.log('Worker'.padEnd(24), weeks.map((w) => `wk${w}`.padStart(7)).join(''), '   any weekend?');
  for (const [w, d] of byWorker) {
    const perWeek = weeks.map((wk) => {
      let sum = 0;
      for (const [date, h] of d) if (isoWeek(new Date(`${date}T00:00:00Z`)) === wk) sum += h;
      return sum;
    });
    const weekendDays = [...d.keys()].filter((date) => {
      const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
      return wd === 0 || wd === 6;
    });
    console.log(
      (nameById.get(w) || w).padEnd(24),
      perWeek.map((s) => (s ? s.toFixed(1) : '·').padStart(7)).join(''),
      '   ' + (weekendDays.length ? `⚠ ${weekendDays.join(',')}` : 'none'),
    );
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
