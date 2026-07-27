# Email deliverability (byggexp.se)

Invoices and worker emails are sent from `noreply@byggexp.se` via Inleed
(`prime6.inleed.net`, IPs `188.66.60.20/21`). DNS is managed at the domain
registrar / Inleed control panel — **these records cannot be changed from code**.

## Current state (audited 2026-07-27)

| Record | Status | Value |
| --- | --- | --- |
| **SPF** | ✅ correct | `v=spf1 a mx ip4:188.66.60.20 ip4:188.66.60.21 include:spf.inleed.se -all` |
| **DKIM** | ✅ present | selector `x._domainkey.byggexp.se`, valid RSA key |
| **DMARC** | ⚠️ weak | `v=DMARC1; p=none; sp=none;` — monitoring only, no reports collected |

SPF and DKIM are properly set up, so mail is authenticated. The only gap is
DMARC: it neither enforces a policy nor collects aggregate reports.

## Recommended change — harden DMARC

Update the TXT record at `_dmarc.byggexp.se`.

**Step 1 — start collecting reports (safe, no delivery impact):**

```
v=DMARC1; p=none; rua=mailto:dmarc@byggexp.se; ruf=mailto:dmarc@byggexp.se; fo=1; adkim=s; aspf=s
```

**Step 2 — after ~2–4 weeks of clean reports, enforce:**

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@byggexp.se; fo=1; pct=100
```

Later `p=quarantine` → `p=reject` once you're confident no legitimate mail fails.

## Notes

- Create the `dmarc@byggexp.se` mailbox (or forward it) before adding `rua`.
- If a second system ever sends as `@byggexp.se` (e.g. a CRM), add its
  include/IP to SPF and set up its DKIM selector too, or DMARC will fail it.
- Verify after changes: `dig +short TXT _dmarc.byggexp.se`.
