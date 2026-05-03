"use client";

import { useAutoSync } from "@/lib/sync";

export function AutoSync(): null {
  useAutoSync();
  return null;
}
