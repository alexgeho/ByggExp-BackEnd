import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Keeps the demo crew "At work" for the whole shoot WITHOUT a background loop:
// sets lastSeenAt into the future so the 15-min heartbeat watchdog never fires.
const COMPANY = '6a6621b011e14c117d0f9275';
const PID = '6a6624b511e14c117d0f9491';
const PROJECT_NAME = 'Byggnation av BRF Peter';
const TODAY = '2026-08-03';
const HOURS_AHEAD = 8;

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const usersCol = db.collection('users');
  const shiftsCol = db.collection('shifts');
  const now = new Date();
  const future = new Date(now.getTime() + HOURS_AHEAD * 3600 * 1000);

  const crew = await usersCol.find({
    companyId: COMPANY, role: { $in: ['worker','projectAdmin'] },
    accountStatus: { $ne: 'waiting_for_approval' },
  }).project({name:1}).toArray();

  for (const u of crew) {
    const id = String(u._id);
    await usersCol.updateOne({ _id: u._id }, { $set: {
      workStatus: 'working', workStatusReason: 'demo',
      workStatusProjectId: PID, workStatusProjectName: PROJECT_NAME,
      workStatusUpdatedAt: now,
      lastSeenAt: future, // <-- future heartbeat: watchdog never pauses them
    }});

    const shift = await shiftsCol.findOne({ workerId: id, shiftDate: TODAY }, { sort: { startedAt: -1 } });
    if (shift) {
      const banked = Number(shift.durationMs) || 0;
      const segments = (Array.isArray(shift.segments) ? shift.segments.filter((s:any)=>s.endedAt) : []);
      segments.push({ startedAt: now, durationMs: 0 });
      await shiftsCol.updateOne({ _id: shift._id }, { $set: {
        status: 'active', autoPausedReason: '', lastResumedAt: now, endedAt: null, segments, durationMs: banked,
      }});
      console.log(`${(u.name||'').padEnd(22)} At work, held until ${future.toLocaleTimeString('sv-SE',{timeZone:'Europe/Stockholm'})} (banked ${(banked/3600000).toFixed(1)}h)`);
    }
  }
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
