#!/usr/bin/env bash
# Replaces the yearly prices with "15% off" (was "2 months free", ~16.7%).
# Stripe prices are immutable, so this creates 4 NEW yearly prices:
#
#   STRIPE_SECRET_KEY=... bash ops/stripe-yearly-15pct-2026-09.sh [run|check|restore]
#
#   run     (default) create each new price (or reuse it if its lookup key
#           already exists), then archive the old one. Safe to re-run.
#   check   only print the state of old and new prices, change nothing.
#   restore re-activate the 4 old yearly prices (rollback).
#
# The key is only read from the environment and never printed. Stripe errors
# are printed and stop the script before anything else is changed. Update the
# 4 printed GitHub secrets, then redeploy.
#
# Yearly = 12 × monthly × 0.85, rounded to whole kronor (SEK excl. moms):
#   Faktura 3 050 · Projekt 7 038 + 704/extra user · Komplett 10 098 + 1 214/extra
#   Integrationer 2 030
set -euo pipefail
: "${STRIPE_SECRET_KEY:?set STRIPE_SECRET_KEY}"
API=https://api.stripe.com/v1
MODE=${1:-run}
case "$MODE" in run|check|restore) ;; *) echo "usage: $0 [run|check|restore]" >&2; exit 2 ;; esac

# Calls Stripe and puts the JSON body in RESP. Never run it inside $(...):
# on an error it must stop the whole script.
stripe() {
  local out code
  out=$(curl -sS -u "${STRIPE_SECRET_KEY}:" -w $'\n%{http_code}' "$@") || { echo "curl failed" >&2; exit 1; }
  code=${out##*$'\n'}; RESP=${out%$'\n'*}
  if [ "$code" -ge 300 ]; then
    echo "Stripe error $code: $(printf '%s' "$RESP" | python3 -c 'import json,sys
e=json.load(sys.stdin).get("error",{}); print(e.get("message"), "| param:", e.get("param"), "| code:", e.get("code"))')" >&2
    exit 1
  fi
}
json() { printf '%s' "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# Sets P_ID, P_ACTIVE (1/0) and P_PRODUCT for a lookup key; P_ID is empty if none.
find_key() {
  stripe -G "$API/prices" -d "lookup_keys[]=$1"
  read -r P_ID P_ACTIVE P_PRODUCT <<<"$(json '" ".join([d["data"][0]["id"], "1" if d["data"][0]["active"] else "0", d["data"][0]["product"]]) if d["data"] else ""')"
}

process() { # <var> <old lookup> <new lookup> <nickname> <price params...>
  local var=$1 old_key=$2 new_key=$3 nick=$4; shift 4
  local old_id old_active prod new_id

  find_key "$old_key"
  [ -n "$P_ID" ] || { echo "old price '$old_key' not found" >&2; exit 1; }
  old_id=$P_ID; old_active=$P_ACTIVE; prod=$P_PRODUCT
  find_key "$new_key"; new_id=$P_ID

  if [ "$MODE" = check ]; then
    echo "# $old_key: $old_id active=$old_active | $new_key: ${new_id:-none}${new_id:+ active=$P_ACTIVE}" >&2
    return
  fi
  if [ "$MODE" = restore ]; then
    [ "$old_active" = 1 ] || stripe "$API/prices/$old_id" -d active=true
    echo "# restored $old_key ($old_id)" >&2
    return
  fi

  if [ -z "$new_id" ]; then
    stripe "$API/prices" -d product="$prod" -d currency=sek -d tax_behavior=exclusive \
      -d "recurring[interval]=year" -d lookup_key="$new_key" --data-urlencode "nickname=$nick" "$@"
    new_id=$(json 'd["id"]')
  else
    echo "# $new_key already exists ($new_id), reusing it" >&2
  fi
  [ "$old_active" = 0 ] || stripe "$API/prices/$old_id" -d active=false
  echo "$var=$new_id"
}

seat() { # <base öre> <per extra öre>
  SEAT=(-d "recurring[usage_type]=licensed" -d billing_scheme=tiered -d tiers_mode=graduated
    -d "tiers[0][up_to]=10" -d "tiers[0][flat_amount]=$1" -d "tiers[0][unit_amount]=0"
    -d "tiers[1][up_to]=inf" -d "tiers[1][unit_amount]=$2")
}

process STRIPE_PRICE_FAKTURA_YEARLY faktura_yearly_2026 faktura_yearly_2026_15 'Faktura år −15%' -d unit_amount=305000
seat 703800 70400
process STRIPE_PRICE_PROJEKT_YEARLY projekt_yearly_2026 projekt_yearly_2026_15 'Projekt år −15%' "${SEAT[@]}"
seat 1009800 121400
process STRIPE_PRICE_KOMPLETT_YEARLY komplett_yearly_2026 komplett_yearly_2026_15 'Komplett år −15%' "${SEAT[@]}"
process STRIPE_PRICE_INTEGRATIONS_YEARLY integrations_yearly_2026 integrations_yearly_2026_15 'Integrationer år −15%' -d unit_amount=203000
