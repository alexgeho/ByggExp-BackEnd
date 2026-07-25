/**
 * Whether scheduled cron jobs should be skipped for this process.
 *
 * Set `DISABLE_CRONS=true` in a local `.env` when running the backend against
 * the production database, so the local instance does not run cron jobs
 * (e.g. task reminder push notifications) in parallel with the deployed server.
 */
export const cronsDisabled = (): boolean =>
  process.env.DISABLE_CRONS === 'true';
