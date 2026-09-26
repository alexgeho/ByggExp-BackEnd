#!/usr/bin/env bash
# Replaces the yearly prices with "15% off" (was "2 months free", ~16.7%).
# Stripe prices are immutable, so this creates 4 NEW yearly prices. Run once:
#
#   STRIPE_SECRET_KEY=... bash ops/stripe-yearly-15pct-2026-09.sh
#
# It reads the product of each current yearly price from Stripe (by the old
# lookup keys), creates the new price on the same product, and archives the old
# one. The key is only read from the environment and never printed. Update the
# 4 printed GitHub secrets, then redeploy.
#
# Yearly = 12 × monthly × 0.85, rounded to whole kronor (SEK excl. moms):
#   Faktura 3 050 · Projekt 7 038 + 704/extra user · Komplett 10 098 + 1 214/extra
#   Integrationer 2 030
set -euo pipefail
: "${STRIPE_SECRET_KEY:?set STRIPE_SECRET_KEY}"
API=https://api.stripe.com/v1

stripe() { curl -sS --fail-with-body -u "${STRIPE_SECRET_KEY}:" "$@"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

old_price() { stripe -G "$API/prices" -d "lookup_keys[]=$1" | json 'd["data"][0]["id"]'; }
product_of() { stripe "$API/prices/$1" | json 'd["product"]'; }
archive() { stripe "$API/prices/$1" -d active=false >/dev/null; }

flat() { # <old lookup> <new lookup> <öre> <nickname>
  local old; old=$(old_price "$1"); local prod; prod=$(product_of "$old")
  local id; id=$(stripe "$API/prices" -d product="$prod" -d currency=sek -d tax_behavior=exclusive \
    -d "recurring[interval]=year" -d unit_amount="$3" -d lookup_key="$2" -d nickname="$4" | json 'd["id"]')
  archive "$old"; echo "$id"
}

seat() { # <old lookup> <new lookup> <base öre> <per extra öre> <nickname>
  local old; old=$(old_price "$1"); local prod; prod=$(product_of "$old")
  local id; id=$(stripe "$API/prices" -d product="$prod" -d currency=sek -d tax_behavior=exclusive \
    -d "recurring[interval]=year" -d "recurring[usage_type]=licensed" \
    -d billing_scheme=tiered -d tiers_mode=graduated \
    -d "tiers[0][up_to]=10" -d "tiers[0][flat_amount]=$3" -d "tiers[0][unit_amount]=0" \
    -d "tiers[1][up_to]=inf" -d "tiers[1][unit_amount]=$4" \
    -d lookup_key="$2" -d nickname="$5" | json 'd["id"]')
  archive "$old"; echo "$id"
}

echo "STRIPE_PRICE_FAKTURA_YEARLY=$(flat faktura_yearly_2026 faktura_yearly_2026_15 305000 'Faktura år −15%')"
echo "STRIPE_PRICE_PROJEKT_YEARLY=$(seat projekt_yearly_2026 projekt_yearly_2026_15 703800 70400 'Projekt år −15%')"
echo "STRIPE_PRICE_KOMPLETT_YEARLY=$(seat komplett_yearly_2026 komplett_yearly_2026_15 1009800 121400 'Komplett år −15%')"
echo "STRIPE_PRICE_INTEGRATIONS_YEARLY=$(flat integrations_yearly_2026 integrations_yearly_2026_15 203000 'Integrationer år −15%')"
