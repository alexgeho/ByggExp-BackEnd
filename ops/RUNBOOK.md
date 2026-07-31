# ByggExp runbook

Short operational notes for this VPS. Written for the moment when something is broken
and nobody wants to read prose.

Applications run as user `deploy`, **not** as root. `pm2 list` as root shows an empty
list and that is normal, not a symptom.

| what | where |
|---|---|
| API (NestJS) | `/opt/byggexp-api/current`, port 3001, `api.byggexp.se` |
| Next.js site | `/opt/byggexp-next/current` |
| Admin | `/opt/byggexp-admin/current`, `admin.byggexp.se` |
| Another product on the same box | `/opt/opsplattform` — not part of ByggExp, leave alone |
| Environment for the API | `/opt/byggexp-api/shared/.env` (mode 600, owner `deploy`) |
| pm2 autostart | systemd unit `pm2-deploy.service`, runs `pm2 resurrect` |
| Monitor | `/opt/byggexp-monitor.sh`, timer `byggexp-monitor.timer`, log `/var/log/byggexp-monitor.log` |
| Monitor settings | `/etc/byggexp-monitor/config` |

## Everyday commands

```bash
sudo -u deploy -H /usr/local/bin/pm2 list          # what is running
sudo -u deploy -H /usr/local/bin/pm2 logs byggexp-api --lines 100 --nostream
systemctl status byggexp-monitor.timer             # is the monitor alive
tail -50 /var/log/byggexp-monitor.log              # what the monitor saw
```

`pm2` is at `/usr/local/bin/pm2`, and that directory is **not** on `deploy`'s PATH in a
non-interactive shell (there it is only `/sbin:/bin:/usr/sbin:/usr/bin`). That is why
`pm2 ...` works when you are logged in and fails from scripts. Always use the full path
in scripts. The deploy workflow now resolves it explicitly for the same reason.

## Restart one app

```bash
cd /opt/byggexp-api/current
sudo -u deploy -H env -u SMTP_HOST -u SMTP_PORT -u SMTP_USER -u SMTP_PASS -u SMTP_FROM \
  /usr/local/bin/pm2 startOrReload ecosystem.config.js --update-env
sudo -u deploy -H /usr/local/bin/pm2 save
```

The `env -u ...` part is not decoration. If any `SMTP_*` variable is set in the shell you
start pm2 from, pm2 freezes it into the process and `pm2 save` writes it into
`~/.pm2/dump.pm2`, which systemd replays after every reboot. Node's `--env-file` does
**not** override a variable that already exists, and an empty string counts as a value,
so a perfectly correct `.env` becomes powerless. This is exactly how outgoing mail kept
breaking. Starting from a clean shell is what prevents it.

## Release and rollback

Deploys happen on push to `main` via GitHub Actions. The workflow:

1. builds and tests, then uploads a tarball;
2. unpacks into `/opt/byggexp-api/releases/<timestamp>`;
3. writes secrets from GitHub Secrets into `shared/.env`, then **unsets** them so pm2
   cannot capture them;
4. remembers the current release, switches the `current` symlink, reloads pm2;
5. health-checks `http://127.0.0.1:3001/` six times over 30 seconds;
6. **on failure: puts the previous release back, reloads, and only then fails the job.**

Manual rollback, if you ever need it:

```bash
ls -1dt /opt/byggexp-api/releases/*/ | head -5      # pick the previous one
ln -sfn /opt/byggexp-api/releases/<TIMESTAMP> /opt/byggexp-api/current
cd /opt/byggexp-api/current
sudo -u deploy -H /usr/local/bin/pm2 startOrReload ecosystem.config.js --update-env
sudo -u deploy -H /usr/local/bin/pm2 save
curl -fsS http://127.0.0.1:3001/ && echo OK
```

Five releases are kept. Older ones are deleted by the workflow.

### About "zero downtime"

`startOrReload` replaces the process in place instead of deleting and starting it, so the
gap is short, but it is **not zero**: the API runs in fork mode with a single instance,
so there is a moment with nothing listening. Honest zero downtime needs two instances.

Cluster mode with two instances is the usual answer and it is **not safe here as is**:
the API registers scheduled jobs (`ScheduleModule` in `app.module`), and a second instance
would run every one of them twice. Doing it properly means guarding the schedule to a
single instance (for example `process.env.NODE_APP_INSTANCE === '0'`) and only then
raising `instances`. That is an application change, not a config change.

## Rotating secrets

`JWT_SECRET` was a placeholder and was replaced on 31.07.2026 with 48 random bytes.
Rotating it logs everybody out, because existing tokens stop validating. Procedure:

```bash
# 1. back up
sudo -u deploy cp -a /opt/byggexp-api/shared/.env /opt/byggexp-api/shared/.env.bak-$(date +%Y%m%d)

# 2. generate ON THE SERVER, so the value never travels through a laptop or a chat
sudo -u deploy node -e '
  const fs = require("fs"), crypto = require("crypto");
  const p = "/opt/byggexp-api/shared/.env";
  const secret = crypto.randomBytes(48).toString("base64url");
  const out = fs.readFileSync(p, "utf8").split(/\r?\n/)
    .map((l) => (/^JWT_SECRET=/.test(l) ? "JWT_SECRET=" + secret : l));
  fs.writeFileSync(p, out.join("\n"), "utf8");
  console.log("rotated, length " + secret.length);
'

# 3. restart (see "Restart one app"), then check the login flow in a browser
```

Same shape works for `SMTP_PASS` and the Stripe keys. If a secret also lives in GitHub
Secrets, update it there too, otherwise the next deploy writes the old value back.

## Certificates and the two domains

Known and **not** fixed, because it needs an owner decision:

* `byggexp.se` (no www) resolves to this server, `185.189.51.128`, and serves a
  **self-signed** certificate from `/etc/ssl/byggexp-bootstrap/`, created 31.07.2026.
  Visitors typing the bare domain get a browser security warning.
* `www.byggexp.se` resolves to **188.66.60.20**, a different machine, and has a valid
  Let's Encrypt certificate.
* `api.byggexp.se` and `admin.byggexp.se` point here and have valid certificates
  (certbot, expiring 26.09.2026).

Issuing a real certificate for the bare domain was attempted with `certbot --dry-run` and
failed: Let's Encrypt validated over **IPv6** (`2a0d:5f47:fffb:cafe:206::1`) and got a 404,
so the AAAA record points somewhere that does not serve the challenge. Fixing this means
deciding what the bare domain should do — redirect to www, or be served here properly —
and then aligning the A/AAAA records with that decision.

## Monitoring

Runs every 5 minutes from `byggexp-monitor.timer`. Checks: API, admin site, all pm2
processes online, and SMTP credentials (connects, STARTTLS, AUTH LOGIN, sends nothing).

Alerts are e-mailed to the address in `/etc/byggexp-monitor/config`. It alerts on the
**change** of state and repeats a still-failing alert at most once an hour, so an outage
does not produce a flood.

Two limits, stated rather than hidden:

* the alert goes out **by mail**, so it cannot report that mail itself is down. A channel
  independent of mail (Telegram bot, phone webhook) fixes this and needs a token from you;
* it does not watch `byggexp.se` or `www.byggexp.se`, see the certificate section above.

To change what is watched or where alerts go, edit `/etc/byggexp-monitor/config` and run
`systemctl restart byggexp-monitor.timer`.

## After a reboot

`pm2-deploy.service` runs `pm2 resurrect`, which restores processes from
`/home/deploy/.pm2/dump.pm2`. Check:

```bash
systemctl status pm2-deploy.service
sudo -u deploy -H /usr/local/bin/pm2 list
curl -fsS http://127.0.0.1:3001/ && echo API OK
```

If mail stops working right after a reboot, the dump has stale environment in it. Restart
from a clean shell as shown above and run `pm2 save` again.
