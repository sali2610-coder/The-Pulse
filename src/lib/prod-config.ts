// Production canonical URLs.
//
// Hard-coded so the setup screens never accidentally print a hash preview
// deployment URL (`the-pulse-XXXXX-…vercel.app`) — those URLs change every
// deploy and are useless for an iOS Shortcut that must keep working
// forever. Always show the stable alias.
//
// Update here ONLY if the production alias actually changes.

export const PROD_ORIGIN = "https://the-pulse-sooty.vercel.app";
export const PROD_WEBHOOK_URL = `${PROD_ORIGIN}/api/webhooks/transactions`;
