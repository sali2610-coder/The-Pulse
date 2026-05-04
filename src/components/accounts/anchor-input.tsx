"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import type { Account } from "@/types/finance";
import { Input } from "@/components/ui/input";
import { tap } from "@/lib/haptics";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(value);

type Props = {
  account: Account;
};

export function AnchorInput({ account }: Props) {
  const setAnchor = useFinanceStore((s) => s.setAnchor);
  const [bumpKey, setBumpKey] = useState(0);

  return (
    <AnchorEditor
      key={`${account.id}-${bumpKey}`}
      account={account}
      onSave={(value) => {
        setAnchor(account.id, value);
        tap();
        setBumpKey((n) => n + 1);
      }}
    />
  );
}

function AnchorEditor({
  account,
  onSave,
}: {
  account: Account;
  onSave: (value: number) => void;
}) {
  const initial =
    account.anchorBalance === undefined ? "" : String(account.anchorBalance);
  const [draft, setDraft] = useState(initial);

  const parsed = Number(draft.replace(/,/g, ""));
  const value = Number.isFinite(parsed) ? parsed : 0;
  const dirty =
    account.anchorBalance === undefined
      ? draft.trim().length > 0
      : value !== account.anchorBalance;

  const updatedAt = account.anchorUpdatedAt
    ? new Date(account.anchorUpdatedAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "מעולם לא עודכן";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>יתרה נוכחית</span>
        <span data-mono="true" style={{ direction: "ltr" }}>
          עודכן · {updatedAt}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          dir="ltr"
          placeholder="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.\-]/g, ""))}
          data-mono="true"
          className="h-10 text-base"
        />
        <motion.button
          type="button"
          disabled={!dirty}
          onClick={() => onSave(value)}
          whileTap={{ scale: 0.94 }}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-30"
          aria-label="שמור anchor"
        >
          <Check className="size-4" />
        </motion.button>
      </div>
      {account.anchorBalance !== undefined ? (
        <div
          data-mono="true"
          className="text-sm"
          style={{
            direction: "ltr",
            color: account.anchorBalance < 0 ? "#F87171" : "#34D399",
          }}
        >
          {formatILS(account.anchorBalance)}
        </div>
      ) : null}
    </div>
  );
}
