import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Appends architectural drawings (Wikimedia Commons, verified real blueprints)
// to the project's recent shift photos, so they show in Recent photos / Photos.
const PID = '6a6624b511e14c117d0f9491';
const BLUEPRINTS = [
  { name: 'Planritning – bottenvåning.jpg', mimeType: 'image/jpeg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/2_bhk_Bungalow_floor_plan.jpg/1920px-2_bhk_Bungalow_floor_plan.jpg' },
  { name: 'Fasad-, sektions- och planritning.png', mimeType: 'image/png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Architectural_projections.PNG/1920px-Architectural_projections.PNG' },
  { name: 'Planlösning – ritning.jpg', mimeType: 'image/jpeg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/69/1920_Harris_Homes_plan_M1022.jpg' },
];

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const shiftsCol = db.collection('shifts');
  const shifts = await shiftsCol.find({ projectId: PID }).sort({ shiftDate: -1 }).limit(2).toArray();
  if (!shifts.length) { console.log('no shifts'); await mongoose.disconnect(); return; }

  // Put 2 drawings on the newest shift, 1 on the next, appended to existing photos.
  const split = [BLUEPRINTS.slice(0, 2), BLUEPRINTS.slice(2)];
  for (let i = 0; i < shifts.length && i < split.length; i++) {
    const s = shifts[i];
    const existing = Array.isArray(s.photos) ? s.photos : [];
    const add = split[i].map((b) => ({ ...b, size: 0, uploadedAt: new Date(s.startedAt || `${s.shiftDate}T12:00:00Z`) }));
    await shiftsCol.updateOne({ _id: s._id }, { $set: { photos: [...add, ...existing] } });
    console.log(`${s.shiftDate}  +${add.length} blueprints (now ${existing.length + add.length} photos)`);
  }
  console.log('Done.');
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
