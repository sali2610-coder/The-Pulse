import type { NextConfig } from "next";

// Pinned production origin. NextAuth derives its OAuth `redirect_uri`
// from the request host by default; on Vercel preview deployments and
// alternate aliases that meant Google saw a host the Cloud Console
// hadn't registered → redirect_uri_mismatch. Forcing AUTH_URL here at
// build time makes NextAuth always emit the canonical callback.
const CANONICAL_ORIGIN = "https://the-pulse-sooty.vercel.app";

const SECURITY_HEADERS = [
  // Force HTTPS for any subsequent navigation. Vercel terminates TLS at the
  // edge so this is always safe for the production domain.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Inject AUTH_URL into both server and client bundles. NextAuth v5
  // honors this as the authoritative base URL when present.
  // NEXTAUTH_URL kept as a legacy alias for any code path that still
  // reads the v4 name.
  env: {
    AUTH_URL: CANONICAL_ORIGIN,
    NEXTAUTH_URL: CANONICAL_ORIGIN,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
