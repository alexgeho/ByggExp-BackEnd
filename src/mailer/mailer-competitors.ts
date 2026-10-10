// Public list prices of the systems our leads already use (SEK/month excl.
// VAT, checked 2026-10-10 on each vendor's price page). Used to put a
// "you'd save X kr/month" figure in reply drafts. null = price not public.

export type Competitor = {
  name: string;
  match: RegExp;
  // Monthly cost for a team of `users`, or null when not public.
  monthly: ((users: number) => number) | null;
  note: string;
};

const band = (users: number, steps: [number, number][], extra: number) => {
  for (const [max, price] of steps) if (users <= max) return price;
  const [lastMax, lastPrice] = steps[steps.length - 1];
  return lastPrice + (users - lastMax) * extra;
};

export const COMPETITORS: Competitor[] = [
  {
    name: "Bygglet",
    match: /bygglet/i,
    // Bas (2–5) / Total (6+) + KMA 589 + egenkontroll 269; 1 year binding.
    monthly: (u) => (u <= 1 ? 1049 : u <= 5 ? 1479 : 2289) + 589 + 269,
    note: "Bas/Total + KMA + egenkontroll, 12 mån bindningstid",
  },
  {
    name: "Fieldly",
    match: /fieldly/i,
    monthly: (u) => Math.max(u, 3) * 439,
    note: "Pro 439 kr/användare (årsavtal)",
  },
  {
    name: "Trinax",
    match: /trinax/i,
    monthly: (u) =>
      band(
        u,
        [
          [1, 799],
          [5, 1099],
          [10, 1599],
          [20, 2499],
        ],
        159,
      ) + 797,
    note: "Work + egenkontroll, KMA och personalliggare",
  },
  {
    name: "Struqtur",
    match: /struqtur/i,
    monthly: (u) => 299 + u * 199,
    note: "Komplett 299 kr + 199 kr/användare",
  },
  {
    name: "Next / Hantverksdata",
    match: /\bnext\b|hantverksdata|jobbnet/i,
    monthly: () => 2100,
    note: "Foundation från 2 100 kr",
  },
  {
    name: "Remato",
    match: /remato/i,
    monthly: (u) => Math.max(u, 10) * 99,
    note: "Crew Pro, minst 10 användare, ingen fakturering",
  },
  {
    name: "Softone",
    match: /softone/i,
    monthly: null,
    note: "pris ej publikt",
  },
  {
    name: "SmartDok",
    match: /smartdok/i,
    monthly: null,
    note: "pris ej publikt",
  },
  {
    name: "Fortnox",
    match: /fortnox/i,
    monthly: null,
    note: "bokföring + tillägg",
  },
  { name: "Visma / Spiris", match: /visma|spiris/i, monthly: null, note: "" },
  {
    name: "Hantverksappen",
    match: /hantverksappen/i,
    monthly: null,
    note: "pris ej publikt",
  },
  {
    name: "Eget system",
    match:
      /eget system|egen app|egna? (app|program|lösning)|own app|своё|свое|свою/i,
    monthly: null,
    note: "",
  },
];

// ByggExp Komplett: 990 kr incl. 10 users, then 119 kr per extra user.
export const byggexpMonthly = (users: number) =>
  990 + Math.max(0, users - 10) * 119;

export const findCompetitor = (text: string): Competitor | null =>
  COMPETITORS.find((c) => c.match.test(String(text || ""))) || null;

// Savings for typical small teams; empty when the price isn't public.
export const savingsFor = (name: string) => {
  const c = COMPETITORS.find((x) => x.name === name);
  if (!c?.monthly) return [];
  const price = c.monthly;
  return [3, 5, 10].map((users) => ({
    users,
    theirs: price(users),
    ours: byggexpMonthly(users),
    saving: price(users) - byggexpMonthly(users),
  }));
};
