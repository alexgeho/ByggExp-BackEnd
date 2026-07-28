# ByggExp invoice mail worker

A Cloudflare Email Worker that turns invoices e-mailed to `faktura@byggexp.se`
(or any address you route to it) into draft supplier invoices in ByggExp.

Flow: **e-mail with PDF → this worker extracts attachments → POST to
`/inbound/supplier-invoices` → OCR → draft leverantörsfaktura (tagged "Från
e-post") for review.**

## Prerequisites

1. The backend must have the `INBOUND_INVOICE_TOKEN` secret set (GitHub secret
   on the ByggExp-BackEnd repo, then run the deploy). Until then the webhook
   returns 503 and this worker will reject mail.
2. `ANTHROPIC_API_KEY` must be configured on the backend (already done) so the
   OCR step works.
3. A Cloudflare account with `byggexp.se` added as a zone.

## One-time setup

```bash
cd email-worker
npm install

# 1) Set the shared secret (paste the SAME value as the backend secret):
npx wrangler secret put INBOUND_INVOICE_TOKEN

# 2) Put your company id in wrangler.toml -> INBOUND_COMPANY_ID
#    (ask Claude to fetch it, or copy it from a project URL / the DB).

# 3) Deploy the worker:
npx wrangler deploy
```

Then, in the Cloudflare dashboard:

1. **byggexp.se → Email → Email Routing → Enable** (adds the required MX/TXT
   records automatically).
2. **Email Routing → Routes → Create address** → `faktura@byggexp.se` →
   Action **Send to a Worker** → pick **byggexp-invoice-mail**.

## Test

E-mail (or forward) a PDF invoice to `faktura@byggexp.se`. Within a few seconds
a draft appears in **Leverantörsfakturor** with the **Från e-post** tag and the
supplier / amount / due date pre-filled from OCR. Check the run in
`wrangler tail` if nothing shows up:

```bash
npx wrangler tail
```

## Configuration reference

| Name                    | Where            | Purpose                                         |
| ----------------------- | ---------------- | ----------------------------------------------- |
| `INBOUND_WEBHOOK_URL`   | wrangler.toml var| Backend endpoint (default `https://api.byggexp.se/inbound/supplier-invoices`) |
| `INBOUND_COMPANY_ID`    | wrangler.toml var| Company that owns the ingested invoices         |
| `INBOUND_INVOICE_TOKEN` | wrangler secret  | Shared secret, must match the backend secret    |

## Security notes

- The worker only forwards PDF/image attachments; other content is ignored.
- The webhook is authenticated by the shared token and is disabled unless the
  token is configured, so a leaked address alone cannot inject invoices.
- Invoices arrive as **drafts (registered)** and must be reviewed/approved by a
  human before payment — nothing is paid automatically.
