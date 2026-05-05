"use client";

import { CopyChip } from "./copy-chip";

type Props = {
  webhookUrl: string;
  token: string | null;
};

const EXAMPLE_BODY = `{
  "issuer": "cal",
  "smsBody": "<<תוכן ההודעה מהבנק>>"
}`;

/**
 * The iOS Shortcut "Get Contents of URL" recipe rendered as 4 stacked cards
 * matching the field labels in the Shortcuts app, so a user can fill in
 * each field with one tap-copy → tap-paste cycle.
 */
export function ShortcutCheatsheet({ webhookUrl, token }: Props) {
  const authValue = token ? `Bearer ${token}` : "Bearer <יוצר טוקן בשלב 3>";

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
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Headers
        </div>
        <div className="grid gap-1.5">
          <CopyChip label="Authorization" value={authValue} />
          <CopyChip label="Content-Type" value="application/json" />
        </div>
      </div>

      <CopyChip label="Body (JSON)" value={EXAMPLE_BODY} block />

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        ערך{" "}
        <code className="font-mono text-foreground/80">issuer</code> צריך להיות{" "}
        <code className="font-mono text-foreground/80">cal</code> או{" "}
        <code className="font-mono text-foreground/80">max</code> בהתאם לשם
        השולח. את <code className="font-mono text-foreground/80">smsBody</code>{" "}
        ממלאים מה־variable של ה־Shortcut (Shortcut Input → Message → Contents).
      </p>
    </div>
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
