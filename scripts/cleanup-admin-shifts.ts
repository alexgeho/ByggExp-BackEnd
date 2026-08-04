import { config } from 'dotenv';
config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const shiftsCol = db.collection('shifts');
  const all = await shiftsCol.find({}).toArray();
  const users = await db.collection('users').find({}).project({ role: 1 }).toArray();
  const roleById = new Map(users.map((u) => [String(u._id), u.role]));
  // companyAdmin / superadmin should not carry billable shifts on the crew grid.
  const remove = all.filter((s) => {
    const r = roleById.get(String(s.workerId));
    return r === 'companyAdmin' || r === 'superadmin';
  });
  const backup = join(__dirname, `admin-shift-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  writeFileSync(backup, JSON.stringify(remove, null, 2));
  console.log(`Backed up ${remove.length} admin shifts -> ${backup}`);
  if (remove.length) {
    const res = await shiftsCol.deleteMany({ _id: { $in: remove.map((s) => s._id) } });
    console.log(`Deleted ${res.deletedCount} admin/superadmin shifts.`);
  } else console.log('None to delete.');
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
