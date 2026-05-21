"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { categorize } from "@/lib/parsers";
import {
  ackPendingConfirmation,
  subscribePendingConfirmation,
} from "@/lib/pending-confirm-channel";
import { ConfirmationSheet } from "@/components/confirmation/confirmation-sheet";
import { GlassPopup } from "@/components/ui/glass-popup";
import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry } from "@/types/finance";

type PendingTransaction = {
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
};

type PendingApiResponse = {
  ok: boolean;
  configured: boolean;
  transaction: PendingTransaction | null;
};

/**
 * Single overlay mounted near the app root. Listens to the
 * pending-confirm channel and renders the GlassPopup confirmation
 * sheet over whatever the user happens to be looking at — no router
 * navigation required, no flicker through the dashboard, no race with
 * Next route loading.
 *
 * Triggered by:
 *   1. SW postMessage → PendingConfirmListener → channel
 *   2. /api/push/click beacon poll → PendingConfirmListener → channel
 *   3. /confirm/[externalId] page → channel (then redirects to /)
 *   4. Settings test push button → channel (direct)
 *
 * Resolves the entry by:
 *   1. Looking it up in the local store first (the AutoSync hook may
 *      have already pulled it in).
 *   2. Falling back to GET /api/transactions/pending/:externalId and
 *      `addExpense`-ing the result so the confirmation sheet has a
 *      stable id to confirm against.
 */
export function PendingConfirmOverlay() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const addExpense = useFinanceStore((s) => s.addExpense);

  const [externalId, setExternalId] = useState<string | null>(null);
  const [serverEntry, setServerEntry] = useState<ExpenseEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchInFlightFor = useRef<string | null>(null);

  // 1. Subscribe to channel.
  useEffect(() => {
    const unsub = subscribePendingConfirmation((event) => {
      setExternalId((current) =>
        current === event.externalId ? current : event.externalId,
      );
    });
    return unsub;
  }, []);

  // 2. Resolve the entry — try local store first, fall back to server.
  const localEntry = useMemo(
    () =>
      externalId
        ? entries.find((e) => e.externalId === externalId)
        : undefined,
    [externalId, entries],
  );

  useEffect(() => {
    if (!externalId) return;
    if (!hydrated) return;
    if (localEntry) return;
    if (serverEntry?.externalId === externalId) return;
    if (fetchInFlightFor.current === externalId) return;

    fetchInFlightFor.current = externalId;
    setLoading(true);
    setError(null);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/transactions/pending/${encodeURIComponent(externalId)}`,
          {
            method: "GET",
            headers: { "x-sally-device": getOrCreateDeviceId() },
            cache: "no-store",
          },
        );
        if (cancelled) return;
        if (!res.ok) {
          setError("transaction_not_found");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as PendingApiResponse;
        if (!data.transaction) {
          setError("transaction_not_found");
          setLoading(false);
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
        if (cancelled) return;
        setServerEntry(result.entry);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("network_error");
        setLoading(false);
      } finally {
        fetchInFlightFor.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [externalId, hydrated, localEntry, serverEntry, addExpense]);

  // Auto-seed category for partial wallet entries — same approach as
  // the legacy /confirm page.
  const seededEntry = useMemo<ExpenseEntry | null>(() => {
    const candidate = localEntry ?? serverEntry;
    if (!candidate) return null;
    if (candidate.category !== "other") return candidate;
    const guess: CategoryId = candidate.merchant
      ? categorize(candidate.merchant)
      : "other";
    return guess === candidate.category
      ? candidate
      : { ...candidate, category: guess };
  }, [localEntry, serverEntry]);

  function closeOverlay() {
    if (externalId) ackPendingConfirmation(externalId);
    setExternalId(null);
    setServerEntry(null);
    setError(null);
    setLoading(false);
  }

  if (!externalId) return null;

  // Error path — small floating card explaining we couldn't find it.
  if (error && !seededEntry) {
    return (
      <GlassPopup open onOpenChange={closeOverlay} title="לא מצאנו את החיוב">
        <div className="flex flex-col items-center gap-2 px-1 pb-1 pt-2 text-center">
          <h2 className="text-base font-semibold text-foreground">
            לא מצאנו את החיוב
          </h2>
          <p className="text-[12px] text-muted-foreground">
            ייתכן שהוא כבר אושר במכשיר אחר או פג תוקפו.
          </p>
          <button
            type="button"
            onClick={closeOverlay}
            className="mt-1 rounded-xl border border-white/12 bg-black/30 px-4 py-2 text-[12px] text-foreground"
          >
            סגור
          </button>
        </div>
      </GlassPopup>
    );
  }

  // Loading path — keep the popup chrome so the user sees the same
  // top-floating card instead of a separate full-screen loader.
  if (loading || !seededEntry) {
    return (
      <GlassPopup open onOpenChange={closeOverlay} title="טוען חיוב">
        <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.6} />
          טוען את החיוב…
        </div>
      </GlassPopup>
    );
  }

  return (
    <ConfirmationSheet
      open
      onOpenChange={(next) => {
        if (!next) closeOverlay();
      }}
      entry={seededEntry}
    />
  );
}
