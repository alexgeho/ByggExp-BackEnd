import { randomBytes } from "crypto";

// Every company gets a private e-mail address for supplier invoices, e.g.
// faktura+k7m2x9qa@byggexp.se. Mail to it is routed by the Cloudflare email
// worker (email-worker/) to POST /inbound/supplier-invoices?code=<code>.
// The domain/format is configurable; "{code}" is replaced with the code.
export const inboundAddressTemplate = () =>
  process.env.INBOUND_ADDRESS_TEMPLATE || "faktura+{code}@byggexp.se";

export const inboundAddressFor = (code: string) =>
  inboundAddressTemplate().replace("{code}", code);

// 10 characters, no look-alikes (0/o, 1/l/i), lower case so it survives any
// mail client's case folding.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const newInboundCode = (length = 10) =>
  Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join(
    "",
  );

export const isInboundCode = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]{6,32}$/.test(value);
