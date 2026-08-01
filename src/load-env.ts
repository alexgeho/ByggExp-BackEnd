import * as dotenv from "dotenv";

// Load the .env file with override BEFORE anything reads the environment.
//
// Why override: pm2 can inject empty SMTP_*/secret variables into the process
// from an old saved dump (dump.pm2), and Node's `--env-file` does NOT overwrite
// a variable that is already set — an empty string counts as set. That made
// outgoing mail read as "not configured" even though the .env file was correct.
// Loading the file here with { override: true } makes the file authoritative
// regardless of what pm2 (or the pm2 daemon) put into the environment.
//
// At runtime the app's cwd is the release dir whose `.env` is a symlink to the
// shared /opt/byggexp-api/shared/.env; locally it is the repo's own .env.
dotenv.config({ override: true });
