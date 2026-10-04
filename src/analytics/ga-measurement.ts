import { randomInt } from "crypto";

// Server-side GA4 events via the Measurement Protocol. When the browser's GA
// client/session ids are known (from the _ga cookies on .byggexp.se) the event
// joins that visitor's session, so GA attributes it to the right channel.
// No-op until GA_API_SECRET is set.
const ENDPOINT = "https://www.google-analytics.com/mp/collect";
const DEFAULT_MEASUREMENT_ID = "G-551T40R4WV"; // byggexp.se property

export async function sendGaEvent(
  name: string,
  params: Record<string, string | number>,
  ids: { clientId?: string; sessionId?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const secret = env.GA_API_SECRET;
  if (!secret) return false;
  const measurementId = env.GA_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
  const clientId =
    ids.clientId || `${randomInt(1e9)}.${Math.floor(Date.now() / 1000)}`;
  const body = {
    client_id: clientId,
    events: [
      {
        name,
        params: {
          ...params,
          ...(ids.sessionId ? { session_id: ids.sessionId } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
  const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return res.ok;
}
