import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "he-IL",
  },
  projects: [
    {
      name: "chromium-mobile",
      // Pixel 7 ships with Chromium, so we don't need WebKit. Production
      // target is iPhone Safari but Chromium gets us 95% of mobile coverage.
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Phase 395 — E2E runs in single-device mode so the
      // Supabase-auth gate doesn't shadow the dashboard. The
      // server-side `isSupabaseServerConfigured` returns false on
      // empty URL → page.tsx falls through to AppShell.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
