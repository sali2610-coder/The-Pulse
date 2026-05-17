// NextAuth catch-all handler. Auth.js v5 exports `handlers` from the
// config; this file just re-exports the GET + POST.
//
// The existing `/api/auth/token` route stays — Next.js static segments
// take precedence over catch-alls, so the legacy stub still answers 503
// without being hijacked.

import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
