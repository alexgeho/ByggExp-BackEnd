import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Adds photos "taken by the worker during their shift" to Denis Hok's shift.
const PID = '6a6624b511e14c117d0f9491';
const WORKER_NAME = 'Denis Hok';
const PHOTOS = [
  { name: 'Montage reglar plan 1.jpg', mimeType: 'image/jpeg', url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1400&q=80' },
  { name: 'Isolering yttervagg.jpg', mimeType: 'image/jpeg', url: 'https://images.unsplash.com/photo-1607400201889-565b1ee75f8e?w=1400&q=80' },
  { name: 'Arbetsplatsen formiddag.jpg', mimeType: 'image/jpeg', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1400&q=80' },
];

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const usersCol = db.collection('users');
  const shiftsCol = db.collection('shifts');

  const worker = await usersCol.findOne({ name: WORKER_NAME });
  if (!worker) { console.log('worker not found'); await mongoose.disconnect(); return; }

  const shift = await shiftsCol.findOne({ projectId: PID, workerId: String(worker._id) }, { sort: { shiftDate: -1 } });
  if (!shift) { console.log('no shift for worker'); await mongoose.disconnect(); return; }

  const start = new Date(shift.startedAt || `${shift.shiftDate}T07:00:00+02:00`);
  const existing = Array.isArray(shift.photos) ? shift.photos : [];
  // Stamp each photo at a different time during the shift (as if snapped live).
  const add = PHOTOS.map((p, i) => ({ ...p, size: 0, uploadedAt: new Date(start.getTime() + (i + 1) * 45 * 60 * 1000) }));
  await shiftsCol.updateOne({ _id: shift._id }, { $set: { photos: [...add, ...existing] } });
  console.log(`${WORKER_NAME}  shift ${shift.shiftDate}  +${add.length} photos (now ${existing.length + add.length})`);
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
