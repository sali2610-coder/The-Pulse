"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { AUTH_ENABLED } from "@/lib/auth-config";
import type { CategoryId } from "@/lib/categories";
import { categorize } from "@/lib/parsers";
import { ConfirmationSheet } from "@/components/confirmation/confirmation-sheet";
import type { ExpenseEntry } from "@/types/finance";

type PendingResponse = {
  ok: boolean;
  configured: boolean;
  transaction: {
    externalId: string;
    amount: number;
    category: string;
    paymentMethod: "cash" | "credit";
    installments: number;
    issuer: "cal" | "max" | "wallet";
    source?: "sms" | "wallet";
    cardLast4?: string;
    merchant?: string;
    note?: string;
    occurredAt: string;
    needsConfirmation?: boolean;
    bankPending?: boolean;
    rawNotificationBody?: string;
  } | null;
};

export function ConfirmPageClient({ externalId }: { externalId: string }) {
  const router = useRouter();
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const localEntry = useFinanceStore((s) =>
    s.entries.find((e) => e.externalId === externalId),
  );
  const addExpense = useFinanceStore((s) => s.addExpense);

  const [open, setOpen] = useState(true);
  const [serverEntry, setServerEntry] = useState<ExpenseEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);

  // Trigger the server-fetch fallback when the entry isn't already local.
  useEffect(() => {
    if (!hydrated) return;
    if (localEntry) return;
    if (fetchAttempted) return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (!AUTH_ENABLED) {
          headers["x-sally-device"] = getOrCreateDeviceId();
        }
        const res = await fetch(
          `/api/transactions/pending/${encodeURIComponent(externalId)}`,
          { method: "GET", headers, cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setError("transaction_not_found");
          setFetchAttempted(true);
          return;
        }
        const data = (await res.json()) as PendingResponse;
        if (!data.transaction) {
          setError("transaction_not_found");
          setFetchAttempted(true);
          return;
        }
        const tx = data.transaction;
        const result = addExpense({
          amount: tx.amount,
          category: tx.category as CategoryId,
          note: tx.note,
          installments: Math.max(1, tx.installments),
          paymentMethod: tx.paymentMethod,
          source: tx.source ?? (tx.issuer === "wallet" ? "wallet" : "sms"),
          chargeDate: tx.occurredAt,
          externalId: tx.externalId,
          issuer: tx.issuer === "wallet" ? undefined : tx.issuer,
          cardLast4: tx.cardLast4,
          merchant: tx.merchant,
          bankPending: tx.bankPending,
          needsConfirmation: tx.needsConfirmation,
          rawNotificationBody: tx.rawNotificationBody,
        });
        setServerEntry(result.entry);
        setFetchAttempted(true);
      } catch {
        if (!cancelled) {
          setError("network_error");
          setFetchAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, localEntry, externalId, addExpense, fetchAttempted]);

  const loading = !hydrated || (!localEntry && !serverEntry && !error);

  const entry = useMemo(() => {
    if (localEntry) return localEntry;
    return serverEntry;
  }, [localEntry, serverEntry]);

  // Make sure the picked category respects sanitize/categorize when the
  // server row landed with the default `other` from a Wallet partial. Done
  // at render time so subsequent edits in the sheet stick.
  const seededEntry = useMemo<ExpenseEntry | null>(() => {
    if (!entry) return null;
    if (entry.category !== "other") return entry;
    const guess: CategoryId = entry.merchant
      ? categorize(entry.merchant)
      : "other";
    return guess === entry.category ? entry : { ...entry, category: guess };
  }, [entry]);

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      // Small delay lets the sheet animate out before the route changes.
      setTimeout(() => router.replace("/"), 250);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[80dvh] items-center justify-center">
        <Loader2
          className="h-6 w-6 animate-spin text-muted-foreground"
          strokeWidth={1.6}
        />
      </main>
    );
  }

  if (error || !seededEntry) {
    return (
      <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          לא מצאנו את החיוב
        </h1>
        <p className="text-sm text-muted-foreground">
          ייתכן שהוא כבר אושר במכשיר אחר או פג תוקפו.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="rounded-2xl border border-white/12 bg-surface/60 px-4 py-2 text-sm text-foreground"
        >
          חזרה לדשבורד
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[80dvh]">
      <ConfirmationSheet
        open={open}
        onOpenChange={handleClose}
        entry={seededEntry}
      />
    </main>
  );
}
