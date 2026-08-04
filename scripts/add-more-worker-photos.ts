import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

const PID = '6a6624b511e14c117d0f9491';
const ASSIGN: Record<string, {name:string;url:string}[]> = {
  'Roger Eriksson': [
    { name: 'Stomresning plan 2.jpg', url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1400&q=80' },
    { name: 'Fasadarbete syd.jpg', url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1400&q=80' },
    { name: 'Kontrollmatning.jpg', url: 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1400&q=80' },
  ],
  'Antony Hartman': [
    { name: 'Gjuten grundplatta.jpg', url: 'https://images.unsplash.com/photo-1590274853856-f22d5ee3d228?w=1400&q=80' },
    { name: 'Materialleverans.jpg', url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1400&q=80' },
    { name: 'Isolering vind.jpg', url: 'https://images.unsplash.com/photo-1607400201889-565b1ee75f8e?w=1400&q=80' },
  ],
};

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const usersCol = db.collection('users');
  const shiftsCol = db.collection('shifts');

  for (const [workerName, photos] of Object.entries(ASSIGN)) {
    const worker = await usersCol.findOne({ name: workerName });
    if (!worker) { console.log(`${workerName}: not found`); continue; }
    const shift = await shiftsCol.findOne({ projectId: PID, workerId: String(worker._id) }, { sort: { shiftDate: -1 } });
    if (!shift) { console.log(`${workerName}: no shift`); continue; }
    const start = new Date(shift.startedAt || `${shift.shiftDate}T07:00:00+02:00`);
    const existing = Array.isArray(shift.photos) ? shift.photos : [];
    const add = photos.map((p, i) => ({ name: p.name, url: p.url, mimeType: 'image/jpeg', size: 0, uploadedAt: new Date(start.getTime() + (i + 1) * 40 * 60 * 1000) }));
    await shiftsCol.updateOne({ _id: shift._id }, { $set: { photos: [...add, ...existing] } });
    console.log(`${workerName}  shift ${shift.shiftDate}  +${add.length} (now ${existing.length + add.length})`);
  }
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
