"use client";

import { useAutoSync } from "@/lib/sync";
import { useRemoteStateSync } from "@/lib/remote-state-sync";

export function AutoSync(): null {
  useAutoSync();
  useRemoteStateSync();
  return null;
}
