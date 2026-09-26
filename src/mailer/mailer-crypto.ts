import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

// Keys are derived from JWT_SECRET (always set in prod, see auth/jwt-secret.ts)
// so the mailer needs no extra secret to configure.
const baseSecret = () => process.env.JWT_SECRET || "";

const key = (purpose: string) =>
  createHash("sha256").update(`${baseSecret()}:mailer:${purpose}`).digest();

// SMTP password at rest: iv.tag.ciphertext (base64url).
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("smtp"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const [iv, tag, enc] = stored
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("smtp"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

// Click-tracking links carry a signature so the redirect endpoint can't be
// abused as an open redirect to arbitrary sites.
export function signLink(token: string, url: string): string {
  return createHmac("sha256", key("links"))
    .update(`${token}\n${url}`)
    .digest("base64url")
    .slice(0, 22);
}

export function verifyLink(token: string, url: string, sig: string): boolean {
  const expected = Buffer.from(signLink(token, url));
  const given = Buffer.from(String(sig || ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const newToken = () => randomBytes(16).toString("hex");
