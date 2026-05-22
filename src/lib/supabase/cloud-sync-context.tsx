"use client";

// Shares the `useCloudSync` state across every consumer in the tree.
// Mounted once near the app root; child components subscribe via
// `useCloudSyncState`. Splitting context out of the hook avoids
// re-running the hydration / write loop in every component that
// needs to read the state.

import { createContext, useContext, type ReactNode } from "react";

import { useCloudSync, type CloudSyncState } from "./use-cloud-sync";

const Ctx = createContext<CloudSyncState | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const state = useCloudSync();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useCloudSyncState(): CloudSyncState | null {
  return useContext(Ctx);
}
