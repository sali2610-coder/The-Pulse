#!/usr/bin/env bash
# Sally — one-shot Vercel deployment bootstrap.
#
# Usage:
#   ./scripts/setup.sh
#
# What it does:
#   1. Confirms the Vercel CLI is installed and you're logged in.
#   2. Links this repo to a new (or existing) Vercel project.
#   3. Provisions Upstash Redis (free plan) via the Marketplace.
#   4. Generates WEBHOOK_SECRET (legacy mode) + VAPID keypair.
#   5. Writes them all to Vercel envs (production + development).
#   6. Prompts for your Clerk keys; flips NEXT_PUBLIC_AUTH_ENABLED=true.
#   7. Triggers a production deployment.
#
# Prerequisites:
#   - Node 18+ and npm
#   - A Vercel account (https://vercel.com)
#   - A Clerk account (https://dashboard.clerk.com) — pull pk_test_… + sk_test_…
#
# Re-running is safe: existing env vars are skipped unless you pass --force.

set -euo pipefail

GREEN='\033[1;32m'
BLUE='\033[1;34m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
DIM='\033[2m'
RESET='\033[0m'

step() { echo -e "${BLUE}▶${RESET} $1"; }
ok() { echo -e "${GREEN}✓${RESET} $1"; }
warn() { echo -e "${YELLOW}!${RESET} $1"; }
err() { echo -e "${RED}✗${RESET} $1"; exit 1; }
prompt() { read -r -p "$(echo -e "${DIM}❯${RESET} $1 ")" "$2"; }

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# 1. CLI present?
step "Checking Vercel CLI"
if ! command -v vercel >/dev/null 2>&1 && ! npx --no-install vercel --version >/dev/null 2>&1; then
  warn "Vercel CLI not installed. Installing locally…"
  npm install --silent --save-dev vercel
fi
ok "Vercel CLI ready"

# 2. Login check
step "Checking Vercel login"
if ! npx vercel whoami >/dev/null 2>&1; then
  warn "Not logged in. Running 'vercel login' (this opens your browser)…"
  npx vercel login
fi
WHO=$(npx vercel whoami 2>/dev/null | tail -1)
ok "Logged in as: $WHO"

# 3. Link project
step "Linking project"
if [ -d .vercel ]; then
  ok "Already linked"
else
  prompt "Project name (lowercase, no dashes-x3) [the-pulse]:" PROJECT_NAME
  PROJECT_NAME=${PROJECT_NAME:-the-pulse}
  npx vercel link --yes --project "$PROJECT_NAME" || npx vercel link --yes
  ok "Linked"
fi

# 4. Upstash KV
step "Provisioning Upstash KV (free)"
if npx vercel env ls 2>/dev/null | grep -q "KV_REST_API_URL"; then
  ok "KV already provisioned"
else
  warn "Installing Upstash. You may need to accept Marketplace terms in browser."
  npx vercel integration accept-terms upstash --yes >/dev/null 2>&1 || true
  npx vercel integration add upstash/upstash-kv --plan free --name sally-kv
  ok "KV provisioned"
fi

# Helper: add env var to production + development if missing.
upsert_env() {
  local NAME=$1
  local VALUE=$2
  if [ "$FORCE" = "0" ] && npx vercel env ls 2>/dev/null | grep -q "^ $NAME "; then
    ok "$NAME already set"
    return 0
  fi
  for ENV in production development; do
    echo "$VALUE" | npx vercel env add "$NAME" "$ENV" --value "$VALUE" --yes >/dev/null 2>&1 || true
  done
  ok "$NAME set"
}

# 5. WEBHOOK_SECRET (legacy mode — kept as fallback)
step "Generating WEBHOOK_SECRET (legacy single-user fallback)"
WEBHOOK_SECRET_VALUE=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
upsert_env WEBHOOK_SECRET "$WEBHOOK_SECRET_VALUE"

# 6. VAPID keys
step "Generating VAPID keypair (Web Push)"
VAPID_JSON=$(npx web-push generate-vapid-keys --json 2>/dev/null || npx --yes web-push generate-vapid-keys --json)
VAPID_PUB=$(echo "$VAPID_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).publicKey));")
VAPID_PRIV=$(echo "$VAPID_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).privateKey));")
prompt "Email for VAPID subject (mailto:…):" VAPID_EMAIL
VAPID_EMAIL=${VAPID_EMAIL:-you@example.com}
upsert_env VAPID_PUBLIC_KEY "$VAPID_PUB"
upsert_env VAPID_PRIVATE_KEY "$VAPID_PRIV"
upsert_env VAPID_SUBJECT "mailto:$VAPID_EMAIL"
upsert_env NEXT_PUBLIC_VAPID_PUBLIC_KEY "$VAPID_PUB"

# 7. Clerk keys
step "Configuring Clerk (multi-user auth)"
echo
echo "  Open https://dashboard.clerk.com → create app → API Keys."
echo "  Copy your Publishable Key (pk_test_…) and Secret Key (sk_test_…)."
echo
prompt "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:" CLERK_PUB
prompt "CLERK_SECRET_KEY:" CLERK_SEC

if [ -z "$CLERK_PUB" ] || [ -z "$CLERK_SEC" ]; then
  warn "Clerk keys not provided. Auth will stay disabled. You can re-run later."
else
  upsert_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "$CLERK_PUB"
  upsert_env CLERK_SECRET_KEY "$CLERK_SEC"
  upsert_env NEXT_PUBLIC_AUTH_ENABLED "true"
  ok "Multi-user auth enabled"
fi

# 8. Deploy
step "Deploying to production"
DEPLOY_OUTPUT=$(npx vercel deploy --prod --yes 2>&1)
echo "$DEPLOY_OUTPUT" | tail -5
URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]+\.vercel\.app' | head -1)
echo
ok "Deployment ready"
[ -n "$URL" ] && echo -e "  ${BLUE}→${RESET} $URL"

echo
echo "════════════════════════════════════════════════════════════════════"
echo "  Sally is live."
echo "════════════════════════════════════════════════════════════════════"
echo
echo "Next steps:"
echo "  1. Open the URL above on your iPhone in Safari."
echo "  2. Share → Add to Home Screen."
echo "  3. Sign in via Clerk (your wife and friends each create their own)."
echo "  4. Settings → Personal API Token → Generate."
echo "  5. Build the iOS Shortcut per docs/ios-shortcut.md, paste the token"
echo "     as the Bearer header."
echo
echo "  The legacy x-sally-device + WEBHOOK_SECRET path still works for"
echo "  existing single-user installs — but new deployments use per-user"
echo "  tokens by default (NEXT_PUBLIC_AUTH_ENABLED=true)."
