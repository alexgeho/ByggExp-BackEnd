import { config } from 'dotenv'; config();
import mongoose from 'mongoose';

// Adds mock construction photos to the project by attaching them to its most
// recent shifts (the project "Recent photos" / Photos tab aggregate shift.photos).
const PID = '6a6624b511e14c117d0f9491';
const IMAGES = [
  { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80', name: 'Byggarbetsplats.jpg' },
  { url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80', name: 'Stomresning.jpg' },
  { url: 'https://images.unsplash.com/photo-1590274853856-f22d5ee3d228?w=1200&q=80', name: 'Grundplatta.jpg' },
  { url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=80', name: 'Fasadarbete.jpg' },
  { url: 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200&q=80', name: 'Takarbete.jpg' },
  { url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80', name: 'Materialleverans.jpg' },
];

async function main(){
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const shiftsCol = db.collection('shifts');
  const shifts = await shiftsCol.find({ projectId: PID }).sort({ shiftDate: -1 }).limit(6).toArray();
  console.log(`Attaching photos to ${shifts.length} recent shifts`);
  let img = 0;
  for (const s of shifts) {
    // 2 photos per shift, cycling through the image set.
    const photos = [0, 1].map(() => {
      const it = IMAGES[img % IMAGES.length]; img += 1;
      return { name: it.name, url: it.url, mimeType: 'image/jpeg', size: 0, uploadedAt: new Date(s.startedAt || `${s.shiftDate}T12:00:00Z`) };
    });
    await shiftsCol.updateOne({ _id: s._id }, { $set: { photos } });
    console.log(`  ${s.shiftDate}  ${String(s.workerId).slice(-6)}  +${photos.length} photos`);
  }
  console.log('Done.');
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
