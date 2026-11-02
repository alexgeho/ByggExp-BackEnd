import { createSign } from "crypto";

// Google Sheets: append new leads to the owner's lead sheet. Uses the same
// service account as GA (GA_SA_KEY_B64); the sheet must be shared with its
// e-mail as Editor. Plain fetch + RS256 JWT, no Google SDK.

type SaKey = { client_email: string; private_key: string };

const saKey = (): SaKey | null => {
  try {
    const raw = process.env.GA_SA_KEY_B64;
    return raw
      ? (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as SaKey)
      : null;
  } catch {
    return null;
  }
};

export const sheetsAccount = () => saKey()?.client_email || "";

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const key = saKey();
  if (!key) throw new Error("GA_SA_KEY_B64 saknas");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256")
    .update(`${head}.${claim}`)
    .sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

// ".../spreadsheets/d/<id>/edit#gid=<gid>" → id + gid (tab).
export function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const id = String(url || "").match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return null;
  const gid = String(url).match(/[#&?]gid=(\d+)/)?.[1] || "";
  return { id, gid };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    const msg = body.slice(0, 200);
    if (/SERVICE_DISABLED|has not been used/.test(body))
      throw new Error("В Google Cloud не включён Google Sheets API");
    throw new Error(
      res.status === 403 || res.status === 404
        ? `Нет доступа к таблице — поделитесь ей с ${sheetsAccount()} (редактор)`
        : `Google Sheets ${res.status}: ${msg}`,
    );
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// Tab title + the texts in column A (to skip leads already in the sheet).
export async function sheetColumnA(url: string) {
  const p = parseSheetUrl(url);
  if (!p) throw new Error("Неверная ссылка на таблицу");
  const meta = (await api(
    `${p.id}?fields=sheets.properties(sheetId,title)`,
  )) as {
    sheets?: { properties: { sheetId: number; title: string } }[];
  };
  const tabs = meta.sheets || [];
  const tab =
    tabs.find((s) => String(s.properties.sheetId) === p.gid) || tabs[0];
  if (!tab) throw new Error("В таблице нет листов");
  const title = tab.properties.title;
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'!A:A`);
  const vals = (await api(`${p.id}/values/${range}`)) as {
    values?: string[][];
  };
  return {
    id: p.id,
    title,
    sheetId: tab.properties.sheetId,
    colA: (vals.values || []).map((r) => r[0] || ""),
  };
}

// New leads go right under the header row (newest on top); the inserted
// rows take the formatting of the row below them.
export async function insertRowsOnTop(
  id: string,
  sheetId: number,
  title: string,
  rows: string[][],
) {
  if (!rows.length) return;
  await api(`${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: 1,
              endIndex: 1 + rows.length,
            },
            inheritFromBefore: false,
          },
        },
      ],
    }),
  });
  const range = encodeURIComponent(
    `'${title.replace(/'/g, "''")}'!A2:D${1 + rows.length}`,
  );
  await api(`${id}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
}

// Removes whole rows (0-based indexes), bottom first so indexes stay valid.
export async function deleteSheetRows(
  id: string,
  sheetId: number,
  rows: number[],
) {
  if (!rows.length) return;
  await api(`${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [...rows]
        .sort((a, b) => b - a)
        .map((i) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: i,
              endIndex: i + 1,
            },
          },
        })),
    }),
  });
}
