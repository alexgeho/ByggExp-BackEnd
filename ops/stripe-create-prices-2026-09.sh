#!/usr/bin/env bash
# Creates the Stripe prices for the 2026-09 plans (Faktura / Projekt / Komplett
# + the Integrationer add-on). Run once, by the account owner:
#
#   STRIPE_SECRET_KEY=... STRIPE_PRODUCT_ID=prod_... bash ops/stripe-create-prices-2026-09.sh
#
# STRIPE_PRODUCT_ID = the existing ByggExp product. The key is only read from the
# environment and never printed. The script prints the 8 GitHub secret names with
# their price IDs (price IDs are not secret) — add them under
# ByggExp-BackEnd → Settings → Secrets and variables → Actions, then redeploy.
#
# Prices are SEK excl. moms (tax_behavior=exclusive). Yearly = 10 × monthly
# ("2 månader gratis"). Projekt/Komplett are graduated tiered prices: the first
# 10 users are covered by a flat base fee, each further user costs the per-seat
# amount; the subscription quantity is the company's billable seat count.
set -euo pipefail

: "${STRIPE_SECRET_KEY:?set STRIPE_SECRET_KEY}"
: "${STRIPE_PRODUCT_ID:?set STRIPE_PRODUCT_ID (the ByggExp product)}"

API=https://api.stripe.com/v1

stripe_post() {
  curl -sS --fail-with-body -u "${STRIPE_SECRET_KEY}:" "$API/$1" "${@:2}"
}

price_id() { python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'; }

# flat_price <lookup_key> <interval month|year> <amount öre> <nickname>
flat_price() {
  stripe_post prices \
    -d product="$STRIPE_PRODUCT_ID" -d currency=sek -d tax_behavior=exclusive \
    -d "recurring[interval]=$2" -d unit_amount="$3" \
    -d lookup_key="$1" -d nickname="$4" | price_id
}

# seat_price <lookup_key> <interval> <base öre> <per extra user öre> <nickname>
seat_price() {
  stripe_post prices \
    -d product="$STRIPE_PRODUCT_ID" -d currency=sek -d tax_behavior=exclusive \
    -d "recurring[interval]=$2" -d "recurring[usage_type]=licensed" \
    -d billing_scheme=tiered -d tiers_mode=graduated \
    -d "tiers[0][up_to]=10" -d "tiers[0][flat_amount]=$3" -d "tiers[0][unit_amount]=0" \
    -d "tiers[1][up_to]=inf" -d "tiers[1][unit_amount]=$4" \
    -d lookup_key="$1" -d nickname="$5" | price_id
}

# Integrationer is its own product so it shows as a separate line on invoices.
ADDON_PRODUCT=$(stripe_post products -d name="ByggExp Integrationer" | price_id)

echo "STRIPE_PRICE_FAKTURA_MONTHLY=$(flat_price faktura_monthly_2026 month 29900 'Faktura månad')"
echo "STRIPE_PRICE_FAKTURA_YEARLY=$(flat_price faktura_yearly_2026 year 299000 'Faktura år')"
echo "STRIPE_PRICE_PROJEKT_MONTHLY=$(seat_price projekt_monthly_2026 month 69000 6900 'Projekt månad')"
echo "STRIPE_PRICE_PROJEKT_YEARLY=$(seat_price projekt_yearly_2026 year 690000 69000 'Projekt år')"
echo "STRIPE_PRICE_KOMPLETT_MONTHLY=$(seat_price komplett_monthly_2026 month 99000 11900 'Komplett månad')"
echo "STRIPE_PRICE_KOMPLETT_YEARLY=$(seat_price komplett_yearly_2026 year 990000 119000 'Komplett år')"
STRIPE_PRODUCT_ID="$ADDON_PRODUCT"
echo "STRIPE_PRICE_INTEGRATIONS_MONTHLY=$(flat_price integrations_monthly_2026 month 19900 'Integrationer månad')"
echo "STRIPE_PRICE_INTEGRATIONS_YEARLY=$(flat_price integrations_yearly_2026 year 199000 'Integrationer år')"
