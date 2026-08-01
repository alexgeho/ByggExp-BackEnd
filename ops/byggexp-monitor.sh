#!/bin/bash
# ByggExp uptime monitor.
#
# Checks the things that actually break, and alerts only when the state CHANGES,
# so a long outage does not turn into a flood of identical mail. A flood teaches
# people to filter the alerts away, which is worse than having none.
#
# What is checked:
#   1. API answers on its port
#   2. public site answers
#   3. SMTP accepts the credentials (STARTTLS + AUTH LOGIN, nothing is sent)
#   4. all pm2 processes are online
#
# Install: see RUNBOOK.md. Runs from a systemd timer every 5 minutes.
set -uo pipefail

ENV_FILE=/opt/byggexp-api/shared/.env
STATE_DIR=/var/lib/byggexp-monitor
LOG=/var/log/byggexp-monitor.log
SITE_URL="${MONITOR_SITE_URL:-https://byggexp.se/}"
API_URL="${MONITOR_API_URL:-http://127.0.0.1:3001/}"
# Where alerts go. Change this one line to your own address.
ALERT_TO="${MONITOR_ALERT_TO:-app@byggexp.se}"
# Re-send a still-failing alert at most once every this many seconds.
REPEAT_AFTER=3600

mkdir -p "$STATE_DIR"
touch "$LOG"

log() { printf '%s %s\n' "$(date -Is)" "$1" >> "$LOG"; }

# Reads a key from the env file without exporting the whole file into this shell.
env_get() { grep -m1 "^${1}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-; }

check_http() {
  curl -fsS -m 10 -o /dev/null "$1" 2>/dev/null
}

check_smtp() {
  node -e '
    const net = require("net"), tls = require("tls");
    const [H, P, U, W] = process.argv.slice(1);
    let sock = net.connect(Number(P), H), step = 0, secure = false;
    const done = (code) => { try { sock.end(); } catch (e) {} process.exit(code); };
    const send = (s) => sock.write(s + "\r\n");
    function onData(d) {
      const t = d.toString();
      if (step === 0) { send("EHLO byggexp.se"); step = 1; return; }
      if (step === 1) { if (!secure) { send("STARTTLS"); step = 2; } else { send("AUTH LOGIN"); step = 3; } return; }
      if (step === 2) {
        const up = tls.connect({ socket: sock, servername: H, rejectUnauthorized: true }, () => {
          secure = true; sock = up; sock.on("data", onData); send("EHLO byggexp.se"); step = 1;
        });
        up.on("error", () => done(1));
        return;
      }
      if (step === 3) { send(Buffer.from(U).toString("base64")); step = 4; return; }
      if (step === 4) { send(Buffer.from(W).toString("base64")); step = 5; return; }
      if (step === 5) { done(/^235/.test(t) ? 0 : 1); }
    }
    sock.on("data", onData);
    sock.on("error", () => done(1));
    setTimeout(() => done(1), 30000);
  ' "$1" "$2" "$3" "$4" >/dev/null 2>&1
}

check_pm2() {
  local offline
  offline=$(sudo -u deploy -H /usr/local/bin/pm2 jlist 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try { const j = JSON.parse(s);
          console.log(j.filter(p => p.pm2_env.status !== "online").map(p => p.name).join(","));
        } catch (e) { console.log("pm2-unreadable"); }
      })' 2>/dev/null)
  [ -z "$offline" ]
}

# Alerts by mail. Deliberate limitation, stated out loud rather than hidden:
# if SMTP itself is down this cannot deliver. A channel independent of mail
# (Telegram bot, phone webhook) is the fix, and it needs a token from the owner.
send_alert() {
  local subject="$1" body="$2"
  local host port user pass from
  host=$(env_get SMTP_HOST); port=$(env_get SMTP_PORT)
  user=$(env_get SMTP_USER); pass=$(env_get SMTP_PASS); from=$(env_get SMTP_FROM)
  node -e '
    const nodemailer = require("/opt/byggexp-api/current/node_modules/nodemailer");
    const [host, port, user, pass, from, to, subject, text] = process.argv.slice(1);
    nodemailer.createTransport({ host, port: Number(port), secure: false, auth: { user, pass } })
      .sendMail({ from, to, subject, text })
      .then(() => process.exit(0))
      .catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
  ' "$host" "$port" "$user" "$pass" "$from" "$ALERT_TO" "$subject" "$body" >>"$LOG" 2>&1
}

# One check: name, human description, and the command that decides.
evaluate() {
  local name="$1" human="$2"; shift 2
  local state_file="$STATE_DIR/$name" now prev_state prev_time
  now=$(date +%s)
  if "$@"; then
    if [ -f "$state_file" ]; then
      read -r prev_state prev_time < "$state_file" || true
      if [ "${prev_state:-}" = "FAIL" ]; then
        log "RECOVERED $name"
        send_alert "ByggExp: $human recovered" "Recovered at $(date -Is) on $(hostname)."
      fi
    fi
    printf 'OK %s\n' "$now" > "$state_file"
    return 0
  fi

  prev_state=""; prev_time=0
  [ -f "$state_file" ] && read -r prev_state prev_time < "$state_file" || true
  if [ "${prev_state:-}" != "FAIL" ]; then
    log "FAIL $name (first time)"
    send_alert "ByggExp: $human is DOWN" "Failed at $(date -Is) on $(hostname). See RUNBOOK.md."
    printf 'FAIL %s\n' "$now" > "$state_file"
  elif [ $((now - ${prev_time:-0})) -ge "$REPEAT_AFTER" ]; then
    log "FAIL $name (still down, reminding)"
    send_alert "ByggExp: $human is STILL down" "Still failing at $(date -Is) on $(hostname)."
    printf 'FAIL %s\n' "$now" > "$state_file"
  else
    log "FAIL $name (already alerted, staying quiet)"
  fi
  return 1
}

failures=0
evaluate api  "API"        check_http "$API_URL"  || failures=$((failures + 1))
evaluate site "public site" check_http "$SITE_URL" || failures=$((failures + 1))
evaluate pm2  "pm2 processes" check_pm2 || failures=$((failures + 1))

SMTP_H=$(env_get SMTP_HOST); SMTP_P=$(env_get SMTP_PORT)
SMTP_U=$(env_get SMTP_USER); SMTP_W=$(env_get SMTP_PASS)
if [ -n "$SMTP_H" ] && [ -n "$SMTP_U" ]; then
  evaluate smtp "outgoing mail" check_smtp "$SMTP_H" "$SMTP_P" "$SMTP_U" "$SMTP_W" \
    || failures=$((failures + 1))
else
  log "SKIP smtp (no credentials in $ENV_FILE)"
fi

log "run finished, failing checks: $failures"
exit 0
