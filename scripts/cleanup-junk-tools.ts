import { config } from 'dotenv'; config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

const JUNK_NAMES = ['Toooooo', 'ддд', 'Test tool'];

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const tools = db.collection('tools');
  const junk = await tools.find({ name: { $in: JUNK_NAMES } }).toArray();
  console.log(`Junk tools found: ${junk.length}`);
  junk.forEach((t:any)=>console.log(`  "${t.name}"  status=${t.status||'-'}  ${t._id}`));
  if (!junk.length) { console.log('Nothing to delete.'); await mongoose.disconnect(); return; }
  const backup = join(__dirname, `junk-tools-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  writeFileSync(backup, JSON.stringify(junk, null, 2));
  const res = await tools.deleteMany({ _id: { $in: junk.map((t:any)=>t._id) } });
  console.log(`Backed up -> ${backup}`);
  console.log(`Deleted ${res.deletedCount} junk tools.`);
  const remaining = await tools.countDocuments({});
  console.log(`Remaining tools: ${remaining}`);
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
