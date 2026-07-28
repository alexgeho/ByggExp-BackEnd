// SIE4 export helpers — pure, unit-tested. Produces a SIE type 4 file
// (verifications + chart of accounts) that Fortnox, Visma and BL Administration
// can import. Amounts follow the SIE sign convention: debit positive, credit
// negative, and every verification must sum to zero.

export type SieAccount = { n: number; name: string };

// BAS 2025 default accounts. These are sensible defaults for a Swedish
// construction company; the bookkeeper can remap on import if their plan
// differs.
export const SIE_ACCOUNTS = {
  ar: { n: 1510, name: "Kundfordringar" },
  rot: { n: 1513, name: "Skattefordran ROT/RUT" },
  sales: { n: 3001, name: "Försäljning tjänster inom Sverige, 25% moms" },
  salesReverse: {
    n: 3231,
    name: "Försäljning byggtjänster, omvänd skattskyldighet",
  },
  outVat: { n: 2610, name: "Utgående moms, 25%" },
  rounding: { n: 3740, name: "Öres- och kronutjämning" },
  ap: { n: 2440, name: "Leverantörsskulder" },
  inVat: { n: 2640, name: "Ingående moms" },
  purchase: { n: 4000, name: "Inköp av varor och material" },
} satisfies Record<string, SieAccount>;

export type SieTrans = { account: number; amount: number };
export type SieVerification = {
  series: string;
  number: string | number;
  date: string; // YYYYMMDD
  text: string;
  trans: SieTrans[];
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// CP437 (PC8) code points for the non-ASCII characters that turn up in Swedish
// bookkeeping text. SIE mandates the PC8 code page; everything else falls back
// to a plain ASCII approximation so the file never carries invalid bytes.
const CP437: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  É: 0x90,
  æ: 0x91,
  Æ: 0x92,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  ß: 0xe1,
};
const ASCII_FALLBACK: Record<string, string> = {
  ø: "o",
  Ø: "O",
  "–": "-",
  "—": "-",
  "’": "'",
  "“": '"',
  "”": '"',
};

export function encodeCp437(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80) {
      bytes.push(code);
    } else if (CP437[ch] !== undefined) {
      bytes.push(CP437[ch]);
    } else if (ASCII_FALLBACK[ch]) {
      for (const c of ASCII_FALLBACK[ch]) bytes.push(c.charCodeAt(0));
    } else {
      bytes.push(0x3f); // "?"
    }
  }
  return Buffer.from(bytes);
}

// Accepts a Date, an ISO "YYYY-MM-DD" string, or similar and returns YYYYMMDD.
export function formatSieDate(input?: string | Date | null): string {
  if (!input) return "";
  if (input instanceof Date) {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  const digits = String(input).match(/(\d{4})\D?(\d{2})\D?(\d{2})/);
  if (digits) return `${digits[1]}${digits[2]}${digits[3]}`;
  return "";
}

const sieText = (s: string) =>
  `"${String(s ?? "")
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, " ")
    .trim()}"`;

const sieAmount = (n: number) => round2(n).toFixed(2);

// Any residual left after the known postings (float drift, öresavrundning) is
// pushed onto the rounding account so the verification always balances exactly.
export function balanceTrans(
  trans: SieTrans[],
  roundingAccount = SIE_ACCOUNTS.rounding.n,
): SieTrans[] {
  const nonZero = trans
    .map((t) => ({ account: t.account, amount: round2(t.amount) }))
    .filter((t) => t.amount !== 0);
  const residual = round2(nonZero.reduce((s, t) => s + t.amount, 0));
  if (residual !== 0) {
    nonZero.push({ account: roundingAccount, amount: round2(-residual) });
  }
  return nonZero;
}

export function verificationLines(ver: SieVerification): string[] {
  const lines = [
    `#VER "${ver.series}" "${ver.number}" ${ver.date} ${sieText(ver.text)}`,
    "{",
  ];
  for (const t of ver.trans) {
    lines.push(`   #TRANS ${t.account} {} ${sieAmount(t.amount)}`);
  }
  lines.push("}");
  return lines;
}

export type SieFileInput = {
  companyName: string;
  orgNumber: string;
  generatedDate: string; // YYYYMMDD
  verifications: SieVerification[];
  programVersion?: string;
};

export function buildSieContent(input: SieFileInput): string {
  const usedAccounts = new Map<number, string>();
  for (const [, acc] of Object.entries(SIE_ACCOUNTS)) {
    usedAccounts.set(acc.n, acc.name);
  }
  // Only emit #KONTO for accounts actually referenced.
  const referenced = new Set<number>();
  for (const ver of input.verifications) {
    for (const t of ver.trans) referenced.add(t.account);
  }

  const lines: string[] = [];
  lines.push("#FLAGGA 0");
  lines.push(`#PROGRAM "ByggExp" "${input.programVersion || "1.0"}"`);
  lines.push("#FORMAT PC8");
  lines.push(`#GEN ${input.generatedDate}`);
  lines.push("#SIETYP 4");
  if (input.orgNumber) {
    // SIE expects the bare organisation number (digits only).
    lines.push(`#ORGNR ${String(input.orgNumber).replace(/[^\d]/g, "")}`);
  }
  lines.push(`#FNAMN ${sieText(input.companyName || "")}`);
  for (const n of [...referenced].sort((a, b) => a - b)) {
    const name = usedAccounts.get(n);
    if (name) lines.push(`#KONTO ${n} ${sieText(name)}`);
  }
  for (const ver of input.verifications) {
    lines.push(...verificationLines(ver));
  }
  return lines.join("\r\n") + "\r\n";
}
