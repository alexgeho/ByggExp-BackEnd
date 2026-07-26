/**
 * Point-delete all data belonging to one or more companies (tenants).
 *
 * SAFE BY DEFAULT: prints what it WOULD delete and changes nothing.
 * To actually delete, pass CONFIRM=1. To also drop the company doc(s), add
 * DELETE_COMPANY=1.
 *
 *   # dry run (just counts):
 *   COMPANY_ID=<id>[,<id>] npm run clean:company
 *
 *   # actually delete the company's data (keep the company shell):
 *   COMPANY_ID=<id> CONFIRM=1 npm run clean:company
 *
 *   # also delete the company document(s):
 *   COMPANY_ID=<id> CONFIRM=1 DELETE_COMPANY=1 npm run clean:company
 */
import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('CleanCompanyData');

  const flag = (name: string) => ['1', 'true', 'yes'].includes(String(process.env[name] || '').toLowerCase());
  const companyIds = String(process.env.COMPANY_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const confirm = flag('CONFIRM');
  const deleteCompany = flag('DELETE_COMPANY');
  const listMode = flag('LIST');

  const conn = await mongoose.connect(MONGODB_URI);
  const db = conn.connection.db;
  if (!db) {
    logger.error('No database connection');
    process.exit(1);
  }

  // LIST=1 → show every company with its _id and data counts, so you can pick a target.
  if (listMode) {
    const companies = await db.collection('companies').find({}).project({ name: 1, email: 1 }).toArray();
    logger.log(`Companies (${companies.length}):`);
    for (const c of companies) {
      const id = String(c._id);
      const projectCount = await db.collection('projects').countDocuments({ companyId: id });
      const userCount = await db.collection('users').countDocuments({ companyId: id });
      logger.log(`  ${id}  ${c.name || '—'}  (${projectCount} projects, ${userCount} users)`);
    }
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!companyIds.length) {
    logger.error('COMPANY_ID is required. Tip: LIST=1 npm run clean:company  to see company ids first.');
    process.exit(1);
  }
  logger.log(`Connected. Target companyId(s): ${companyIds.join(', ')}`);
  logger.log(confirm ? '*** CONFIRM=1 → will DELETE ***' : 'DRY RUN → nothing will be deleted (set CONFIRM=1 to delete)');

  // Projects belong to the company; shifts/tasks hang off projects (no companyId).
  const projects = await db
    .collection('projects')
    .find({ companyId: { $in: companyIds } }, { projection: { _id: 1, name: 1 } })
    .toArray();
  const projectIds = projects.map((p) => String(p._id));
  logger.log(`Projects in scope (${projects.length}): ${projects.map((p) => p.name).join(', ') || '—'}`);

  // collection → query. Order: children first, then parents.
  const byCompany = { companyId: { $in: companyIds } };
  const byProject = { projectId: { $in: projectIds } };
  const tasks: Array<{ name: string; coll: string; query: Record<string, unknown> }> = [
    { name: 'shifts', coll: 'shifts', query: byProject },
    { name: 'tasks', coll: 'tasks', query: byProject },
    { name: 'houradjustments', coll: 'houradjustments', query: byCompany },
    { name: 'tools', coll: 'tools', query: byCompany },
    { name: 'invoices', coll: 'invoices', query: byCompany },
    { name: 'offers', coll: 'offers', query: byCompany },
    { name: 'articles', coll: 'articles', query: byCompany },
    { name: 'clients', coll: 'clients', query: byCompany },
    { name: 'users', coll: 'users', query: byCompany },
    { name: 'projects', coll: 'projects', query: byCompany },
  ];

  let grandTotal = 0;
  for (const t of tasks) {
    // shifts/tasks: skip when there are no projects to avoid deleting {$in: []} (which matches nothing anyway)
    const count = await db.collection(t.coll).countDocuments(t.query);
    grandTotal += count;
    if (confirm && count > 0) {
      const res = await db.collection(t.coll).deleteMany(t.query);
      logger.log(`  ${t.name}: deleted ${res.deletedCount}`);
    } else {
      logger.log(`  ${t.name}: ${count}${confirm ? ' (nothing to delete)' : ' would be deleted'}`);
    }
  }

  // Optionally remove the company document(s) themselves.
  const companyObjectIds = companyIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (deleteCompany && companyObjectIds.length) {
    const companyCount = await db.collection('companies').countDocuments({ _id: { $in: companyObjectIds } });
    if (confirm && companyCount > 0) {
      const res = await db.collection('companies').deleteMany({ _id: { $in: companyObjectIds } });
      logger.log(`  companies: deleted ${res.deletedCount}`);
    } else {
      logger.log(`  companies: ${companyCount}${confirm ? '' : ' would be deleted (DELETE_COMPANY=1)'}`);
    }
    grandTotal += companyCount;
  } else {
    logger.log('  companies: kept (add DELETE_COMPANY=1 to remove the company shell too)');
  }

  logger.log(confirm ? `Done. Deleted ~${grandTotal} documents.` : `DRY RUN complete. ~${grandTotal} documents match. Re-run with CONFIRM=1 to delete.`);
  await mongoose.disconnect();
  process.exit(0);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('clean-company-data failed:', err);
  process.exit(1);
});
