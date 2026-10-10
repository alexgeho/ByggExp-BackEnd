import { createSign } from "crypto";
import { Logger } from "@nestjs/common";

// GA4 Data API: site visits that came from mailer links (utm_source=mailer),
// per utm_campaign. Off until GA_PROPERTY_ID + GA_SA_KEY_B64 (service-account
// JSON key, base64) are set. Plain fetch + RS256 JWT, no Google SDK.

const logger = new Logger("MailerGa");

export type GaCampaignStats = {
  sessions: number;
  engaged: number;
  avgSeconds: number;
};

export const gaEnabled = () =>
  Boolean(process.env.GA_PROPERTY_ID && process.env.GA_SA_KEY_B64);

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const key = JSON.parse(
    Buffer.from(process.env.GA_SA_KEY_B64 || "", "base64").toString("utf8"),
  ) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
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
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`GA token ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  token = {
    value: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  };
  return token.value;
}

let cache: { at: number; data: Map<string, GaCampaignStats> } | null = null;

// utm_campaign slug → stats since the first campaign. Cached 30 min; null
// when GA is off or failing (the funnel then just hides the columns).
export async function mailerVisits(): Promise<Map<
  string,
  GaCampaignStats
> | null> {
  if (!gaEnabled()) return null;
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.data;
  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA_PROPERTY_ID}:runReport`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: "2026-09-01", endDate: "today" }],
          dimensions: [{ name: "sessionCampaignName" }],
          metrics: [
            { name: "sessions" },
            { name: "engagedSessions" },
            { name: "averageSessionDuration" },
          ],
          dimensionFilter: {
            filter: {
              fieldName: "sessionSource",
              stringFilter: { value: "mailer" },
            },
          },
          limit: 500,
        }),
      },
    );
    if (!res.ok)
      throw new Error(`GA report ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      rows?: {
        dimensionValues: { value: string }[];
        metricValues: { value: string }[];
      }[];
    };
    const map = new Map<string, GaCampaignStats>();
    for (const r of data.rows || [])
      map.set(r.dimensionValues[0].value, {
        sessions: Number(r.metricValues[0].value) || 0,
        engaged: Number(r.metricValues[1].value) || 0,
        avgSeconds: Math.round(Number(r.metricValues[2].value) || 0),
      });
    cache = { at: Date.now(), data: map };
    return map;
  } catch (err) {
    logger.warn(String(err));
    return null;
  }
}
