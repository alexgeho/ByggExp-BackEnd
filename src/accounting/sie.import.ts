// SIE4 import — pure, unit-tested. Reads a SIE type 4 file (Fortnox, Visma,
// BL…) into one fiscal year: chart of accounts, opening balances and
// verifications. Only the current year (#RAR 0) is taken; #RTRANS/#BTRANS
// are skipped (SIE requires an identical #TRANS after every #RTRANS).

import { encodeCp437 } from "./sie.util";

export type SieImportTrans = { account: number; amount: number; text?: string };
export type SieImportVer = {
  series: string;
  number: string;
  date: string; // YYYY-MM-DD
  text: string;
  trans: SieImportTrans[];
};
export type SieImport = {
  companyName: string;
  orgNumber: string;
  start: string; // YYYY-MM-DD
  end: string;
  accounts: { account: number; name: string }[];
  ib: { account: number; amount: number }[];
  ub: { account: number; amount: number }[]; // as stated in the file
  res: { account: number; amount: number }[];
  verifications: SieImportVer[];
};

// CP437 → Unicode for the bytes SIE files actually use (reverse of export).
const CP437_DECODE: Record<number, string> = {};
for (let i = 0x80; i <= 0xff; i++) {
  // Build the reverse map by encoding every Latin-1 char once.
  const ch = String.fromCharCode(i);
  const b = encodeCp437(ch)[0];
  if (b !== 0x3f && b >= 0x80) CP437_DECODE[b] = ch;
}

export function decodeSie(buf: Buffer): string {
  const text = buf.toString("latin1");
  // Files saved as UTF-8 (some programs ignore #FORMAT PC8).
  if (/\xC3[\x80-\xBF]/.test(text) && !/#FORMAT\s+PC8/i.test(text)) {
    return buf.toString("utf8");
  }
  let out = "";
  for (const byte of buf) {
    out += byte < 0x80 ? String.fromCharCode(byte) : CP437_DECODE[byte] || "?";
  }
  return out;
}

// One line → tokens. Quoted strings keep spaces (\" escapes), {…} is one token.
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === " " || c === "\t") {
      i++;
    } else if (c === '"') {
      let s = "";
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && line[i + 1] === '"') i++;
        s += line[i++];
      }
      i++;
      out.push(s);
    } else if (c === "{") {
      const end = line.indexOf("}", i);
      const stop = end < 0 ? line.length : end + 1;
      out.push(line.slice(i, stop));
      i = stop;
    } else {
      let s = "";
      while (i < line.length && line[i] !== " " && line[i] !== "\t") {
        s += line[i++];
      }
      out.push(s);
    }
  }
  return out;
}

const isoDate = (d: string) =>
  /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
const num = (v: string) =>
  Math.round(Number(String(v).replace(",", ".")) * 100) / 100;

export function parseSie(content: string): SieImport {
  const out: SieImport = {
    companyName: "",
    orgNumber: "",
    start: "",
    end: "",
    accounts: [],
    ib: [],
    ub: [],
    res: [],
    verifications: [],
  };
  let ver: SieImportVer | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "{") continue;
    if (line === "}") {
      if (ver) out.verifications.push(ver);
      ver = null;
      continue;
    }
    const [tag, ...a] = tokenize(line);
    switch (tag) {
      case "#FNAMN":
        out.companyName = a[0] || "";
        break;
      case "#ORGNR":
        out.orgNumber = a[0] || "";
        break;
      case "#RAR":
        if (a[0] === "0") {
          out.start = isoDate(a[1]);
          out.end = isoDate(a[2]);
        }
        break;
      case "#KONTO":
        out.accounts.push({ account: Number(a[0]), name: a[1] || "" });
        break;
      case "#IB":
      case "#UB":
      case "#RES":
        if (a[0] === "0") {
          const key = tag === "#IB" ? "ib" : tag === "#UB" ? "ub" : "res";
          out[key].push({ account: Number(a[1]), amount: num(a[2]) });
        }
        break;
      case "#VER":
        ver = {
          series: a[0] || "",
          number: a[1] || "",
          date: isoDate(a[2]),
          text: a[3] || "",
          trans: [],
        };
        break;
      case "#TRANS":
        if (ver) {
          // #TRANS account {objects} amount [date] [text] [qty] [sign]
          const t: SieImportTrans = {
            account: Number(a[0]),
            amount: num(a[2]),
          };
          if (a[4]) t.text = a[4];
          ver.trans.push(t);
        }
        break;
    }
  }
  return out;
}

// Problems that make the file unusable as one fiscal year.
export function sieProblems(sie: SieImport): string[] {
  const out: string[] = [];
  if (!sie.start || !sie.end) out.push("year");
  for (const v of sie.verifications) {
    const sum = Math.round(v.trans.reduce((s, t) => s + t.amount, 0) * 100);
    if (sum !== 0) out.push(`unbalanced:${v.series}${v.number}`);
  }
  return out;
}

export type LedgerRow = {
  account: number;
  name: string;
  ib: number;
  change: number;
  ub: number;
};

// Balance per account: IB + movements. Result accounts (3xxx–8xxx) have no IB.
export function ledgerBalances(
  accounts: { account: number; name: string }[],
  ib: { account: number; amount: number }[],
  verifications: { trans: SieImportTrans[] }[],
): LedgerRow[] {
  const names = new Map(accounts.map((a) => [a.account, a.name]));
  const rows = new Map<number, LedgerRow>();
  const row = (n: number) => {
    let r = rows.get(n);
    if (!r) {
      r = { account: n, name: names.get(n) || "", ib: 0, change: 0, ub: 0 };
      rows.set(n, r);
    }
    return r;
  };
  for (const b of ib) if (b.account < 3000) row(b.account).ib += b.amount;
  for (const v of verifications) {
    for (const t of v.trans) row(t.account).change += t.amount;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...rows.values()]
    .map((r) => ({
      ...r,
      ib: r2(r.ib),
      change: r2(r.change),
      ub: r2(r.ib + r.change),
    }))
    .filter((r) => r.ib || r.change)
    .sort((x, y) => x.account - y.account);
}
