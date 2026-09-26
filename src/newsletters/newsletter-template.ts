import {
  DEFAULT_SETTINGS,
  NewsletterBlock,
  NewsletterSettings,
} from "./newsletter-render";

// Starting point for "Nytt nyhetsbrev": the September 2026 product newsletter
// (layout modelled on a proven Trinax mailing). Images live in the admin app's
// public folder so they are always reachable from any mail client.
const IMG = "https://admin.byggexp.se/newsletter-template";

export function defaultNewsletterTemplate(): {
  subject: string;
  settings: NewsletterSettings;
  blocks: NewsletterBlock[];
} {
  return {
    subject: "Mer tid på bygget – mindre vid skrivbordet",
    settings: {
      ...DEFAULT_SETTINGS,
      preheader:
        "Tidrapportering, planering, offert och faktura i en app – från 499 kr/mån. Boka en gratis demo.",
      utmCampaign: "nyhetsbrev",
    },
    blocks: [
      {
        id: "hero",
        type: "image",
        src: `${IMG}/hero.jpg`,
        alt: "Byggare som planerar på laptop vid ritningar",
        href: "",
        fullWidth: true,
      },
      {
        id: "h1",
        type: "heading",
        text: "Mer tid på bygget – mindre vid skrivbordet",
        level: "h1",
      },
      {
        id: "intro",
        type: "text",
        text: "Tidrapporter på lappar, planering i Excel och fakturor på kvällen – det är tid som borde gå till kunden. Med ByggExp samlar du hela administrationen i en app, och timmarna blir löneunderlag och faktura av sig själva.",
        muted: false,
      },
      {
        id: "cta1",
        type: "button",
        label: "Se alla funktioner",
        href: "https://byggexp.se/sv/funktioner",
        variant: "outline",
      },
      { id: "sp1", type: "spacer", height: 40 },
      {
        id: "card-main",
        type: "card",
        title: "ByggExp från 499 kr/mån",
        text: "Arbetspass, projekt, planering, egenkontroller, offerter och fakturor – i *ByggExp* finns allt på samma ställe, i mobilen och på datorn.",
        image: `${IMG}/byggexp-allt-i-ett.jpg`,
        imageAlt: "ByggExp – hela byggföretaget i en app",
        href: "https://byggexp.se/sv/funktioner",
        linkLabel: "",
      },
      {
        id: "ingar",
        type: "image",
        src: `${IMG}/ingar-alltid.jpg`,
        alt: "Detta ingår alltid: alla funktioner, obegränsat antal projekt, mobilapp + adminpanel, GPS-incheckning, ingen bindningstid",
        href: "https://byggexp.se/sv#pricing",
        fullWidth: false,
      },
      { id: "sp2", type: "spacer", height: 50 },
      {
        id: "card-tid",
        type: "card",
        title: "Tidrapportering & löneunderlag",
        text: "Personalen stämplar in med GPS i mobilen. OB och övertid enligt byggavtalet räknas automatiskt, och löneunderlaget exporteras som CSV eller AGI-underlag – utan att du knappar in en enda timme.",
        image: `${IMG}/tidrapportering.jpg`,
        imageAlt: "Tidrapportering och löneunderlag i ByggExp",
        href: "https://byggexp.se/sv/funktioner",
        linkLabel: "Pris & funktioner",
      },
      { id: "sp3", type: "spacer", height: 50 },
      {
        id: "card-plan",
        type: "card",
        title: "Planering & bemanning",
        text: "Dra ut personalen på projekten i planeringskalendern. Frånvaro och överbokningar syns direkt, så alla vet var de ska vara imorgon – och du ser snabbt var det finns plats för nya uppdrag.",
        image: `${IMG}/planering.jpg`,
        imageAlt: "Planering och bemanning i ByggExp",
        href: "https://byggexp.se/sv/funktioner",
        linkLabel: "Pris & funktioner",
      },
      { id: "sp4", type: "spacer", height: 50 },
      {
        id: "h-demo",
        type: "heading",
        text: "Att vara nyfiken kostar inget",
        level: "h2",
      },
      {
        id: "demo",
        type: "text",
        text: "Boka en **gratis demo** så går vi igenom ByggExp utifrån just er verksamhet. Efter demon får ni testa gratis i 14 dagar – ingen bindningstid, ingen startavgift.",
        muted: false,
      },
      {
        id: "cta-demo",
        type: "button",
        label: "Boka demo",
        href: "https://byggexp.se/sv/contact",
        variant: "filled",
      },
      { id: "sp5", type: "spacer", height: 40 },
      {
        id: "card-offert",
        type: "card",
        title: "Offert & faktura",
        text: "Skapa offerten direkt i ByggExp, fakturera löpande räkning från rapporterade timmar och följ lönsamheten per projekt – så vet du vilka jobb som faktiskt går med vinst.",
        image: `${IMG}/offert-faktura.jpg`,
        imageAlt: "Offert och faktura i ByggExp",
        href: "https://byggexp.se/sv/funktioner",
        linkLabel: "",
      },
      {
        id: "cta-end",
        type: "button",
        label: "Kom igång",
        href: "https://byggexp.se/sv/contact",
        variant: "outline",
      },
    ],
  };
}

// "Personligt brev": a plain, left-aligned letter without logo, menu or
// images — reads like a one-to-one email, which suits cold outreach.
export function personalLetterTemplate(): {
  subject: string;
  settings: NewsletterSettings;
  blocks: NewsletterBlock[];
} {
  return {
    subject: "Tidrapporter hos {{företag|er}}?",
    settings: {
      ...DEFAULT_SETTINGS,
      layout: "personal",
      preheader: "",
      utmCampaign: "personligt-brev",
    },
    blocks: [
      {
        id: "body",
        type: "text",
        muted: false,
        text: "Hej {{namn|}},\n\nHur samlar ni in tidrapporterna idag – papperslappar, SMS eller Excel?\n\nVi hör ofta från byggfirmor att fredagen går åt till att jaga timmar, och att lönen och fakturan blir fel för att något saknas.\n\nVi har byggt ByggExp för just det: medarbetarna stämplar in med GPS i mobilen, timmarna hamnar på rätt projekt och blir löneunderlag och faktura direkt – utan att någon knappar in något.\n\nSka vi ta 15 minuter nästa vecka? Jag visar hur det skulle se ut för er, och passar det kan ni testa gratis i 14 dagar.",
      },
      {
        id: "sign",
        type: "text",
        muted: false,
        text: "Med vänliga hälsningar,\nAlexander Gerhard\nByggExp · 070-757 75 75",
      },
    ],
  };
}

export type NewsletterTemplateKey = "newsletter" | "personal";

export function newsletterTemplate(key: NewsletterTemplateKey) {
  return key === "personal"
    ? personalLetterTemplate()
    : defaultNewsletterTemplate();
}
