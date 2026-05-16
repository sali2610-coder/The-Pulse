"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";

// Clerk is intentionally NOT imported here. Auth is disabled at the app
// level — the dashboard is a single-user public app served straight from
// `/`. A previous version dynamically wrapped the tree in `<ClerkProvider>`
// gated by a runtime flag, but the import alone introduced edge-runtime
// failures with `pk_test_…` keys in production. Re-introduce by importing
// in a separate, lazily-loaded boundary if multi-user mode comes back.

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: 0 },
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <MotionConfig
        reducedMotion="user"
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
      >
        {children}
        <Toaster richColors position="top-center" dir="rtl" />
      </MotionConfig>
    </QueryClientProvider>
  );
}
