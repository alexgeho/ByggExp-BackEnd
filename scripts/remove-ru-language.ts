import { config } from 'dotenv'; config();
import mongoose from 'mongoose';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Removes the {ru:"Русский"} language preference from all users, switching them
// to Swedish (the company language). App/notifications are Swedish + English only.
async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const users = db.collection('users');
  const affected = await users.find({ 'language.ru': { $exists: true } }).project({name:1,language:1}).toArray();
  console.log(`Users with ru language: ${affected.length}`);
  const backup = join(__dirname, `ru-language-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  writeFileSync(backup, JSON.stringify(affected, null, 2));
  const res = await users.updateMany(
    { 'language.ru': { $exists: true } },
    { $set: { language: { sv: 'Svenska' } } },
  );
  console.log(`Backed up → ${backup}`);
  console.log(`Updated ${res.modifiedCount} users to { sv: "Svenska" }`);
  const remaining = await users.countDocuments({ 'language.ru': { $exists: true } });
  console.log(`Remaining with ru: ${remaining}`);
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
