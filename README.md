# Sally — The Pulse

A multi-user financial OS for Israeli credit cards. Tap-to-pay → SMS → iOS Shortcut → live Pulse + push categorize prompt + per-user CFO projection.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsali2610-coder%2FThe-Pulse&env=NEXT_PUBLIC_AUTH_ENABLED,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT,NEXT_PUBLIC_VAPID_PUBLIC_KEY,WEBHOOK_SECRET&envDescription=See%20.env.example%20for%20full%20list&envLink=https%3A%2F%2Fgithub.com%2Fsali2610-coder%2FThe-Pulse%2Fblob%2Fmain%2F.env.example)

## Quickstart (one command)

```sh
git clone https://github.com/sali2610-coder/The-Pulse.git sally
cd sally
npm install
./scripts/setup.sh
```

The script:

1. Logs you into Vercel (browser).
2. Links the project (creates one if needed).
3. Provisions Upstash KV on the free plan.
4. Generates a `WEBHOOK_SECRET` and a VAPID keypair.
5. Asks for your Clerk keys ([dashboard.clerk.com](https://dashboard.clerk.com)) and flips `NEXT_PUBLIC_AUTH_ENABLED=true`.
6. Deploys to production.

**~3 minutes from clone to live URL.**

## What you'll have

- Production-ready PWA at `https://<your-project>.vercel.app`.
- Multi-user auth via Clerk — your wife, friends, and you each get an isolated dashboard.
- Per-user **Personal API Token** for the iOS Shortcut.
- Web Push categorize prompt every time a charge lands.
- CFO end-of-month projection based on bank anchors + loans + income.

## Manual operation (for the nerds)

If you'd rather run the env-var commands yourself, here they are. Substitute your real values; the script does this for you.

```sh
# Vercel link
npx vercel link --yes --project the-pulse

# Upstash KV (auto-provisions KV_REST_API_URL + KV_REST_API_TOKEN)
npx vercel integration accept-terms upstash --yes
npx vercel integration add upstash/upstash-kv --plan free --name sally-kv

# Webhook + Push secrets
WEBHOOK_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
VAPID=$(npx web-push generate-vapid-keys --json)
VAPID_PUB=$(echo "$VAPID" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).publicKey));")
VAPID_PRIV=$(echo "$VAPID" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).privateKey));")

for ENV in production development; do
  npx vercel env add WEBHOOK_SECRET                 "$ENV" --value "$WEBHOOK_SECRET" --yes
  npx vercel env add VAPID_PUBLIC_KEY               "$ENV" --value "$VAPID_PUB"      --yes
  npx vercel env add VAPID_PRIVATE_KEY              "$ENV" --value "$VAPID_PRIV"     --yes
  npx vercel env add VAPID_SUBJECT                  "$ENV" --value "mailto:you@example.com" --yes
  npx vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY   "$ENV" --value "$VAPID_PUB"      --yes
  npx vercel env add NEXT_PUBLIC_AUTH_ENABLED       "$ENV" --value "true"            --yes
  # Clerk — paste your own:
  npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "$ENV" --value "pk_test_…"    --yes
  npx vercel env add CLERK_SECRET_KEY                  "$ENV" --value "sk_test_…"    --yes
done

# Ship it
npx vercel deploy --prod --yes
```

## Onboarding new users (your wife, friends)

After the deploy is live and you've signed up via Clerk, anyone else just goes through the same site:

1. Open `https://<your-project>.vercel.app` in iPhone Safari.
2. **Add to Home Screen** (Share menu).
3. Sign up via the Clerk modal (email or whatever providers you enabled in Clerk dashboard).
4. Settings → **Personal API Token** → Generate.
5. Build the iOS Shortcut per [`docs/ios-shortcut.md`](docs/ios-shortcut.md), pasting the token as `Authorization: Bearer …`.

Each user's data lives under `sally:user:<userId>:…` in KV. They can never see each other's transactions, anchors, or push history — enforced server-side by [`src/lib/scope-resolver.ts`](src/lib/scope-resolver.ts) on every API request.

## Architecture in 30 seconds

```
[Bank SMS]  →  [iOS Shortcut]  →  POST /api/webhooks/transactions
                                  ↓ (Bearer = user's personal token)
                                  ZADD user-scoped KV
                                  ↓
                                  Web Push w/ category buttons
                                  ↓
[iPhone PWA]  ←  Notification tap (food / transport / other)
       ↑                          ↓
       │                  POST /api/push/categorize
       │                          ↓
       └─────  GET /api/transactions/sync  (with Clerk session)
              overlays category overrides → addExpense()
              → The Pulse animates + chime
```

For full pipeline + CFO formula details: [CLAUDE.md](CLAUDE.md).

## Development

```sh
npm run dev          # http://localhost:3000
npm run lint
npm test             # vitest unit tests
npm run test:e2e     # Playwright (chromium-mobile)
npm run build
```

## License

MIT — clone it, fork it, deploy it for your family.
