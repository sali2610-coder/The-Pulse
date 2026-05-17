"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy } from "lucide-react";

import { CopyChip } from "./copy-chip";
import { tap } from "@/lib/haptics";

type Props = {
  webhookUrl: string;
  deviceId: string;
};

const EXAMPLE_BODY = `{
  "issuer": "cal",
  "smsBody": "<<תוכן ההודעה מהבנק>>"
}`;

/** iOS "Get Contents of URL" cheatsheet for SMS ingestion. Device-id only
 *  auth — no Bearer / WEBHOOK_SECRET. Two header rows + a single
 *  "Copy Headers" button so non-technical users get them with one tap. */
export function ShortcutCheatsheet({ webhookUrl, deviceId }: Props) {
  const headerBlock = `Content-Type: application/json\nx-sally-device: ${deviceId}`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Method">
          <span
            data-mono="true"
            className="inline-flex items-center rounded-lg border border-neon/40 bg-neon/10 px-2.5 py-1 text-[12px] font-medium text-neon"
            style={{ direction: "ltr" }}
          >
            POST
          </span>
        </Field>
        <Field label="Request Body">
          <span
            data-mono="true"
            className="inline-flex items-center rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[12px] font-medium text-gold"
            style={{ direction: "ltr" }}
          >
            JSON
          </span>
        </Field>
      </div>

      <CopyChip label="URL" value={webhookUrl} />

      <div className="space-y-2 rounded-2xl border border-white/5 bg-black/20 p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Headers (2)</span>
          <CopyHeadersButton value={headerBlock} />
        </div>
        <div className="grid gap-1.5">
          <CopyChip label="Content-Type" value="application/json" />
          <CopyChip label="x-sally-device" value={deviceId} />
        </div>
      </div>

      <CopyChip label="Body (JSON)" value={EXAMPLE_BODY} block />

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        ערך <code className="font-mono text-foreground/80">issuer</code> חייב
        להיות <code className="font-mono text-foreground/80">cal</code> או{" "}
        <code className="font-mono text-foreground/80">max</code> לפי שם
        השולח של ה־SMS. את{" "}
        <code className="font-mono text-foreground/80">smsBody</code> ממלאים
        מ־variable Shortcut Input → Message → Contents.
      </p>
    </div>
  );
}

function CopyHeadersButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      tap();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex items-center gap-1 rounded-md border border-neon/40 bg-neon/10 px-2 py-1 text-[10px] font-medium text-neon transition-colors hover:bg-neon/15"
      aria-label="העתק את שני ה־headers"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="ok"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1"
          >
            <Check className="size-3" /> הועתק
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1"
          >
            <Copy className="size-3" /> העתק הכל
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
