import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Links the curated Swedish tasks (with due dates) into project.tasks so the
// project overview "Tasks & deadlines" block shows real dated tasks.
const PID = '6a6624b511e14c117d0f9491';
const LINK = [
  '6a704929c8fad41866393582', // Resning av stomme (open, 07-24)
  '6a704929c8fad41866393585', // Bestall fonster (open, 07-31)
  '6a704929c8fad41866393584', // Montering av yttertak (open, 08-07)
  '6a704929c8fad41866393586', // Slutbesiktning (open, 11-15)
  '6a704929c8fad41866393581', // Gjutning av grundplatta (completed)
  '6a704929c8fad41866393583', // Skyddsrond (completed)
];

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const res = await db.collection('projects').updateOne(
    { _id: new mongoose.Types.ObjectId(PID) },
    { $addToSet: { tasks: { $each: LINK } } },
  );
  const p:any = await db.collection('projects').findOne({_id:new mongoose.Types.ObjectId(PID)},{projection:{tasks:1}});
  console.log(`matched=${res.matchedCount} modified=${res.modifiedCount}; project.tasks now: ${p.tasks.length}`);
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
