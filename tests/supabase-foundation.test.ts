import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _resetSupabaseClientForTests,
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase/client";
import { clearMutations, enqueueMutation } from "@/lib/mutation-queue";
import { runSyncOnce } from "@/lib/supabase/sync-processor";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  clearMutations();
  _resetSupabaseClientForTests();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  if (ORIGINAL_URL !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  }
  if (ORIGINAL_KEY !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  }
  _resetSupabaseClientForTests();
});

describe("supabase client", () => {
  it("reports unconfigured when env is missing", () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseStatus().configured).toBe(false);
    expect(supabase()).toBeNull();
  });

  it("reports configured when both env vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-xyz";
    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseStatus().url).toBe("https://example.supabase.co");
    expect(supabase()).not.toBeNull();
  });

  it("reports unconfigured when only one var is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(isSupabaseConfigured()).toBe(false);
    expect(supabase()).toBeNull();
  });
});

describe("sync-processor", () => {
  it("returns not_configured when Supabase env is missing", async () => {
    enqueueMutation({
      kind: "expense.add",
      payload: { id: "e1", amount: 50 },
    });
    const stats = await runSyncOnce();
    expect(stats.reason).toBe("not_configured");
    expect(stats.attempted).toBe(0);
  });
});
