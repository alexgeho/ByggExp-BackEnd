# ByggExp-BackEnd worklog

## 🟢 SESSION 2026-09-29 — invites honest, weekends off, monitor
### DONE
- `f9fecec` invites: POST /company returns real `invited`, POST /users `inviteEmailSent`, bulk `notEmailed`; new POST /company/:id/resend-invite (fresh token, readable 503).
- `d5d1993` hours: Sat/Sun have no default planned baseline; weekend adjustment starts from 0.
- Monitor fix `21bb7d0` copied to the server (/opt/byggexp-monitor.sh) → RECOVERED smtp.
### NEXT
1. Monitor alerts via Telegram (needs bot token from owner).

## 2026-09-28 — Google-geokodning för projektadress
- /projects/geocode/search och /reverse använder Google (Places API (New) Text Search + Geocoding API) när GOOGLE_MAPS_API_KEY finns; vid fel eller utan nyckel → Nominatim. Kontraktet oförändrat (app + admin kräver ingen release).
- Reverse: väljer första street_address/premise/subpremise-resultatet (annars Googles första).
- Nyckeln: GitHub-secret GOOGLE_MAPS_API_KEY → deploy.yml skriver den till shared/.env.
- Nästa: adress vid kartklick kommer i Nominatim-format → kontrollera att Geocoding API är aktiverat och tillåtet i nyckelns API-restriktioner. Företagsinbjudan (createWithInvite) sväljer SMTP-fel och svarar invited:true → felet ska synas i admin + "skicka igen".

## 2026-09-26 — Fair use för skanning
- Skanning: bara de första 5 sidorna av en PDF skickas till AI (filen sparas hel). pdf-lib tillagd.
- Inkommande fakturamejl: max 20 mejl/dygn per företag och 20 bilagor per mejl tolkas automatiskt; över gränsen sparas filerna ändå, utan tolkning, med en notering att kontakta ByggExp. Nytt fält supplierinvoice.inboundBatch.
- Bildstorlek: Anthropic skalar själv ner bilder (~1568px), så egen nedskalning sparar inga tokens – ej gjord.
- Nästa: ev. månadsräknare för skanningar per plan (100/30) – väntar på beslut.
- Utgående e-post: max 20 kundmejl per företag och dag (fakturor, påminnelser, offerter tillsammans, Stockholmsdygn). Över gränsen: 429 "Dagens gräns för utskick är nådd… kontakta ByggExp". Räknare company.outgoingMail {day,count}.

## 2026-09-26 — Egen fakturaadress per företag
- company.inboundCode (select:false, unik partial index). GET /company/:id/inbound-address (skapar kod vid första anrop), POST …/regenerate (admin). Adress = INBOUND_ADDRESS_TEMPLATE (default faktura+{code}@byggexp.se).
- /inbound/supplier-invoices tar ?code=… (okänd kod → 404 → studs); ?companyId finns kvar.
- email-worker: läser +kod ur mottagaradressen; README: slå på Subaddressing i Cloudflare Email Routing.
- Kvar för ägaren: deploya workern (wrangler), route faktura@byggexp.se → worker, Subaddressing på, INBOUND_INVOICE_TOKEN satt i backend + worker.
