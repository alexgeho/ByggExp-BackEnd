# ByggExp-BackEnd worklog


## 2026-11-18 — Offer PDF from the invoice document component
- Owner: "create a component from the invoice and use it for the offer, so fonts, spacing and design stay". The invoice look moved to `src/common/pdf/document-pdf.ts` (CSS, helpers, locales, line rows, line table, totals band, footers); `invoice-pdf.template.ts` keeps only the invoice header and fixed-height pagination. SE invoice output is byte-identical (se-pdf-snapshot: the 4 invoice snapshots untouched).
- `offer-pdf.template.ts` is rebuilt on the component (SE + NO in one function): invoice header classes, shared line table (flowing, no fixed height), `buildSummaryBand` under the table, invoice footer. Offer wording kept for columns (Beskrivning / Antal / Belopp); amount exact (`roundedTotal = total`), no QR / bank line, no "Sida".
- `offers.service.ts` footer now carries bankgiro / plusgiro (NO: kontonummer) like the invoice footer.
- Second pass (owner: "more professional and more like the invoice"): recipient is 3 lines as on the invoice; an invoice-style detail row under the header (left: Er referens / Org.nr / Telefon / E-post of the customer, right: contact persons as "role  name" + Giltig till); columns Benämning / Antal / Summa; the totals band is pinned above the footer (`margin-top: auto`); the bottom "Kontaktpersoner" block is gone. Page margins moved to `@page` for the offer, so every page of a long offer has them. `offers.service.ts buildOfferPdf` prints a multi-page offer again with the sheet stretched to whole pages (growing allowance for repeated table headers), so totals + footer end at the bottom of the last page; a try is kept only if the page count is unchanged.
- Tests: the 2 offer snapshots re-recorded on purpose; `offer-pdf.template.spec.ts` (Art.nr header markup) and `norway.spec.ts` (Swedish-word check looks at printed text after `</style>`, since the shared stylesheet has Swedish words in comments).

## 2026-11-17 — invites, audit events, sign-in log (details: byggexp-admin/docs/dev-worklog.md, HANDOFF 17.11 evening)
- DONE: company invite accepted → `sendAccountReadyEmail` (11 langs, mail failure never undoes the account); a used invite link answers `{accepted, email, language}` instead of 409; `GET /company` carries `invite {sentAt, acceptedAt}`; audit log got `event` / `message` / `client` + `AuditService.event()` (global module) for invite_sent / invite_opened / invite_accepted / login / password_reset_requested; superadmin may query `?companyId=`, `?scope=all`, `?email=`, `?failed=1`; server log lines `Login ok|failed: <email> (reason)`, `Password reset requested|done`.
- NOT VERIFIED LIVE: the account-ready mail; the new audit events (first real sign-in / invite will show them).
- NEXT (owner's call): retention for audit_logs; reject `POST /assignments` without `projectId`; log opened screens.

## 2026-11-03 — mailer: site inboxes + lead sheet export
- DONE: hourly IMAP sync for inbox:* brands; own-domain form mails parsed (formLead); Google Sheets export (mailer-sheets.ts, SA GA_SA_KEY_B64): newest on top, sheetDone keeps owner-deleted rows out, lostKeys → refusal rows deleted, dates "d Mon yyyy". Commits ec1f868, 3665502.
- NEXT: verify offert@armeringproffs.se forwarder end-to-end; watch sheetError in admin.

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
