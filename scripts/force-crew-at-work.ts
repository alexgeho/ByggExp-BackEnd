import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Puts the demo crew back to "At work" for filming: resumes their active shift,
// clears the offline/no_signal auto-pause, and stamps a fresh lastSeenAt so the
// 15-min heartbeat watchdog won't re-pause them for a while.
const COMPANY = '6a6621b011e14c117d0f9275';
const PID = '6a6624b511e14c117d0f9491';
const PROJECT_NAME = 'Byggnation av BRF Peter';
const TODAY = '2026-08-03';

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const usersCol = db.collection('users');
  const shiftsCol = db.collection('shifts');
  const now = new Date();

  const crew = await usersCol.find({
    companyId: COMPANY,
    role: { $in: ['worker','projectAdmin'] },
    accountStatus: { $ne: 'waiting_for_approval' }, // skip Tino/Alexander
  }).project({name:1}).toArray();

  for (const u of crew) {
    const id = String(u._id);
    // 1) user → working, fresh heartbeat, on the project
    await usersCol.updateOne({ _id: u._id }, { $set: {
      workStatus: 'working',
      workStatusReason: 'demo',
      workStatusProjectId: PID,
      workStatusProjectName: PROJECT_NAME,
      workStatusUpdatedAt: now,
      lastSeenAt: now,
    }});

    // 2) their today's shift → active + resumed (reopen a running segment)
    const shift = await shiftsCol.findOne({ workerId: id, shiftDate: TODAY }, { sort: { startedAt: -1 } });
    if (shift) {
      const banked = Number(shift.durationMs) || 0;
      const segments = Array.isArray(shift.segments) ? shift.segments.filter((s:any)=>s.endedAt) : [];
      segments.push({ startedAt: now, durationMs: 0 }); // open running segment
      await shiftsCol.updateOne({ _id: shift._id }, { $set: {
        status: 'active',
        autoPausedReason: '',
        lastResumedAt: now,
        endedAt: null,
        segments,
        durationMs: banked,
      }});
      console.log(`${(u.name||'').padEnd(22)} → At work (shift resumed, banked ${(banked/3600000).toFixed(1)}h)`);
    } else {
      console.log(`${(u.name||'').padEnd(22)} → working (no shift today)`);
    }
  }
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
