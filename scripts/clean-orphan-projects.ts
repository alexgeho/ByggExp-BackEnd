/**
 * Delete ORPHAN projects — projects whose owning company no longer exists in
 * the `companies` collection — together with their shifts and tasks, and detach
 * them from every user's `projectIds`.
 *
 * This targets ONLY projects under a deleted/missing company, so live tenants
 * (their company document still exists) are never touched.
 *
 * SAFE BY DEFAULT: prints what it WOULD delete and changes nothing.
 * To actually delete, pass CONFIRM=1.
 *
 *   # dry run (just lists orphans + counts):
 *   npm run clean:orphan-projects
 *
 *   # actually delete:
 *   CONFIRM=1 npm run clean:orphan-projects
 */
import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('CleanOrphanProjects');
  const confirm = ['1', 'true', 'yes'].includes(
    String(process.env.CONFIRM || '').toLowerCase(),
  );

  const conn = await mongoose.connect(MONGODB_URI);
  const db = conn.connection.db;
  if (!db) {
    logger.error('No database connection');
    process.exit(1);
  }

  // Every companyId that still has a company document.
  const companies = await db
    .collection('companies')
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const liveCompanyIds = new Set(companies.map((c) => String(c._id)));

  // Projects whose company is missing/empty → orphans.
  const projects = await db
    .collection('projects')
    .find({}, { projection: { name: 1, companyId: 1 } })
    .toArray();
  const orphans = projects.filter((p) => {
    const cid = p.companyId ? String(p.companyId) : '';
    return !cid || !liveCompanyIds.has(cid);
  });

  if (!orphans.length) {
    logger.log('No orphan projects found. Nothing to do.');
    await conn.disconnect();
    return;
  }

  const orphanIds = orphans.map((p) => String(p._id));

  const shiftCount = await db
    .collection('shifts')
    .countDocuments({ projectId: { $in: orphanIds } });
  const taskCount = await db
    .collection('tasks')
    .countDocuments({ projectId: { $in: orphanIds } });
  const usersReferencing = await db
    .collection('users')
    .countDocuments({ projectIds: { $in: orphanIds } });

  logger.log(`Found ${orphans.length} orphan project(s) (company no longer exists):`);
  for (const p of orphans) {
    logger.log(`  - ${p.name || '(unnamed)'}  [_id=${p._id}, companyId=${p.companyId ?? 'none'}]`);
  }
  logger.log(`Related: ${shiftCount} shift(s), ${taskCount} task(s), referenced by ${usersReferencing} user(s).`);

  if (!confirm) {
    logger.warn('DRY RUN — nothing deleted. Re-run with CONFIRM=1 to delete.');
    await conn.disconnect();
    return;
  }

  const delShifts = await db
    .collection('shifts')
    .deleteMany({ projectId: { $in: orphanIds } });
  const delTasks = await db
    .collection('tasks')
    .deleteMany({ projectId: { $in: orphanIds } });
  const pulled = await db
    .collection('users')
    .updateMany({ projectIds: { $in: orphanIds } }, {
      $pull: { projectIds: { $in: orphanIds } },
    } as unknown as Record<string, unknown>);
  const delProjects = await db
    .collection('projects')
    .deleteMany({ _id: { $in: orphans.map((p) => p._id) } });

  logger.log(
    `Deleted: ${delProjects.deletedCount} project(s), ${delShifts.deletedCount} shift(s), ` +
      `${delTasks.deletedCount} task(s); detached from ${pulled.modifiedCount} user(s).`,
  );

  await conn.disconnect();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
