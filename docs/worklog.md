# ByggExp-BackEnd worklog

## 2026-09-26 — Fair use för skanning
- Skanning: bara de första 5 sidorna av en PDF skickas till AI (filen sparas hel). pdf-lib tillagd.
- Inkommande fakturamejl: max 20 mejl/dygn per företag och 20 bilagor per mejl tolkas automatiskt; över gränsen sparas filerna ändå, utan tolkning, med en notering att kontakta ByggExp. Nytt fält supplierinvoice.inboundBatch.
- Bildstorlek: Anthropic skalar själv ner bilder (~1568px), så egen nedskalning sparar inga tokens – ej gjord.
- Nästa: ev. månadsräknare för skanningar per plan (100/30) – väntar på beslut.
- Utgående e-post: max 20 kundmejl per företag och dag (fakturor, påminnelser, offerter tillsammans, Stockholmsdygn). Över gränsen: 429 "Dagens gräns för utskick är nådd… kontakta ByggExp". Räknare company.outgoingMail {day,count}.
