import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

// Backfills missing companyId on users by inferring it from the projects they
// are assigned to, and audits scoped collections for rows without a companyId.
// Dry-run by default; pass --apply to write the inferred user companyIds.
async function bootstrap() {
  const logger = new Logger('BackfillCompanyId');
  const apply = process.argv.includes('--apply');

  try {
    await mongoose.connect(MONGODB_URI);
    logger.log(`Connected to MongoDB (${apply ? 'APPLY' : 'DRY-RUN'})`);

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }));

    const projectCompany = new Map<string, string>();
    for (const p of await Project.find({}).lean()) {
      const cid = (p as any).companyId || (p as any).clientCompanyId;
      if (cid) projectCompany.set(String((p as any)._id), String(cid));
    }

    const orphanUsers = await User.find({
      $or: [{ companyId: null }, { companyId: { $exists: false } }],
    }).lean();

    let inferred = 0;
    let unresolved = 0;
    for (const u of orphanUsers) {
      const projectIds = ((u as any).projectIds || []).map(String);
      const cid = projectIds.map((id) => projectCompany.get(id)).find(Boolean);
      if (!cid) {
        unresolved++;
        logger.warn(`? User ${(u as any)._id} (${(u as any).email}) — no company could be inferred`);
        continue;
      }
      inferred++;
      logger.log(`+ User ${(u as any)._id} (${(u as any).email}) -> company ${cid}`);
      if (apply) {
        await User.updateOne({ _id: (u as any)._id }, { $set: { companyId: cid } });
      }
    }

    // Audit collections that carry a direct companyId field (report only).
    // shifts/tasks are intentionally excluded — they are scoped through their
    // project's companyId and have no companyId column of their own.
    const db = User.db?.db;
    if (db) {
      const scoped = ['invoices', 'offers', 'clients', 'articles', 'tools'];
      logger.log('--- collections missing companyId ---');
      for (const name of scoped) {
        const count = await db
          .collection(name)
          .countDocuments({ $or: [{ companyId: null }, { companyId: { $exists: false } }] })
          .catch(() => 0);
        if (count) logger.warn(`  ${name}: ${count} without companyId`);
      }
    }

    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log(`Orphan users found:   ${orphanUsers.length}`);
    logger.log(`Inferred a company:   ${inferred}${apply ? ' (written)' : ' (dry-run)'}`);
    logger.log(`Could not resolve:    ${unresolved}`);
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
