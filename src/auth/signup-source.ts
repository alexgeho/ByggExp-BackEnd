// Where a self-serve sign-up came from. Captured by the register page (UTM tags,
// external referrer, first page of the visit) and stored on the company so the
// admin can see which channel brings registrations. Mailer campaigns are matched
// by e-mail at account creation.
export type SignupSource = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  referrer: string;
  landing: string;
  client: "web" | "app";
  gaClientId: string;
  gaSessionId: string;
  campaign: string;
  campaignClicked: boolean;
};

const FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "referrer",
  "landing",
] as const;

// Keep only known string fields, trimmed and capped — the body is client input.
export function sanitizeSignupSource(
  raw: unknown,
  userAgent = "",
): Omit<SignupSource, "campaign" | "campaignClicked"> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = {} as Record<(typeof FIELDS)[number], string>;
  for (const k of FIELDS) {
    const v = src[k];
    out[k] = typeof v === "string" ? v.trim().slice(0, 300) : "";
  }
  // The web register page always sends a source object; the mobile app doesn't
  // (and its HTTP client isn't a browser).
  const client = raw || /Mozilla/i.test(userAgent) ? "web" : "app";
  // GA ids from the visitor's _ga cookies — digits and dots only.
  const gaId = (v: unknown) =>
    typeof v === "string" && /^[0-9.]{1,40}$/.test(v) ? v : "";
  return {
    ...out,
    client,
    gaClientId: gaId(src.gaClientId),
    gaSessionId: gaId(src.gaSessionId),
  };
}
