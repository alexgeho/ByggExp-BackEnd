import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

// Fortnox tokens at rest are AES-256-GCM encrypted. The key is FORTNOX_TOKEN_KEY
// when set, else derived from JWT_SECRET (always set in prod), so nothing extra
// is needed to run.
const secret = () =>
  process.env.FORTNOX_TOKEN_KEY || process.env.JWT_SECRET || "";
const key = (purpose: string) =>
  createHash("sha256").update(`${secret()}:fortnox:${purpose}`).digest();

export function encryptToken(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("token"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptToken(stored: string): string {
  if (!stored) return "";
  const [iv, tag, enc] = stored
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("token"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

// OAuth `state`: company + user + expiry, HMAC-signed so the public callback
// knows which company the code belongs to and that we issued it.
export type FortnoxState = {
  companyId: string;
  userId: string;
  exp: number;
  nonce: string;
};

const sign = (body: string) =>
  createHmac("sha256", key("state")).update(body).digest("base64url");

export function signState(
  companyId: string,
  userId: string,
  ttlMs = 60 * 60_000,
): string {
  const state: FortnoxState = {
    companyId,
    userId,
    exp: Date.now() + ttlMs,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyState(
  value: string,
  now = Date.now(),
): FortnoxState | null {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  try {
    const state = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as FortnoxState;
    if (!state.companyId || !(state.exp > now)) return null;
    return state;
  } catch {
    return null;
  }
}
