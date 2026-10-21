// Where a site lead came from, as one short line for the lead mail:
// UTM tags > external referrer host > direct. Empty when the site sent no
// visit data (leads from before tracking, or another client).
export function leadChannel(l: {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  landing?: string;
}): string {
  const host = (() => {
    try {
      return new URL(l.referrer || "").hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const from = l.utmSource
    ? [l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(" / ")
    : host || (l.landing ? "direct" : "");
  if (!from) return "";
  return l.landing ? `${from} → ${l.landing}` : from;
}
