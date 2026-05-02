"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { AUTH_ENABLED } from "@/lib/auth-config";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: 0 },
          // SWR-style: serve cached data instantly, revalidate in background.
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true },
        },
      }),
  );

  const inner = (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-center" dir="rtl" />
    </QueryClientProvider>
  );

  // Only mount ClerkProvider when keys are present, otherwise it crashes
  // the app on missing publishable key.
  if (!AUTH_ENABLED) return inner;

  return (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: "#00E5FF", colorBackground: "#0A0A0A" },
      }}
    >
      {inner}
    </ClerkProvider>
  );
}
