"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  CheckCircle2,
  Circle,
  Info,
  MessageSquare,
  Workflow,
} from "lucide-react";
import { CopyChip } from "./copy-chip";
import { useFinanceStore } from "@/lib/store";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { PROD_WEBHOOK_URL } from "@/lib/prod-config";
import { getOrCreateDeviceId } from "@/lib/device-id";

const SAMPLE_BANK_SMS = `לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק 'שופרסל' בסכום 150.50 ש"ח בתאריך 06/05/26.`;

/**
 * A faithful, annotated mockup of the iOS Shortcuts JSON-body editor in
 * Hebrew RTL. It mirrors the layout of the real Shortcuts UI (right-side
 * key column, left-side value column, drag handles on the outer right) and
 * places copy chips next to every value the user has to enter.
 *
 * The goal: a non-developer wife/friend can open this page on their iPhone
 * next to Shortcuts and copy each field one at a time without guessing.
 */
export function ShortcutVisual() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!AUTH_ENABLED || !hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/token", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { token: string | null };
        if (!cancelled) setToken(data.token);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  // Derive origin synchronously from window. Safe because this is a "use
  // client" component — the SSR pass falls back to the production URL,
  // which is correct anyway.
  // Always pin to the stable production URL — preview hashes would
  // silently rot iOS Shortcuts that users wired up earlier.
  const webhookUrl = PROD_WEBHOOK_URL;
  const deviceId = getOrCreateDeviceId();
  void token;

  return (
    <div className="space-y-5">
      <Hero />

      <Step
        n={1}
        title="פתחי את אפליקציית Shortcuts"
        body="ב־iPhone, חפשי את האפליקציה הסגולה 'Shortcuts' (קיצורי דרך)."
        icon={<Workflow className="size-5" />}
      />

      <Step
        n={2}
        title="Automation → + → Message"
        body="בלשונית Automation, הקליקי + ובחרי 'Message' (הודעה). בחרי את שם השולח של חברת האשראי (CAL / מקס). סמני 'Run Immediately'."
        icon={<MessageSquare className="size-5" />}
      />

      <Step
        n={3}
        title="הוסיפי action: Get Contents of URL"
        body="חיפוש פעולות → 'Get Contents of URL' → הוסיפי. עכשיו יש לך action ריק. הקליקי על החץ למטה כדי לפתוח את ההגדרות שלו."
        icon={<ArrowDownToLine className="size-5" />}
      />

      <ActionMockup webhookUrl={webhookUrl} deviceId={deviceId} />

      <BodyMockup />

      <CommonMistakes />
    </div>
  );
}

function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 backdrop-blur-md"
    >
      <div className="text-[11px] uppercase tracking-[0.3em] text-gold/80">
        Shortcut · ויזואל מלא
      </div>
      <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight text-foreground">
        ככה ההגדרות צריכות להיראות בדיוק.
      </h1>
      <p className="mt-2 text-[12px] text-muted-foreground">
        הקלד/י כל שדה לפי הצבע: <span className="text-neon">תכלת = שם שדה</span>{" "}
        · <span className="text-gold">זהב = ערך</span>. ליד כל ערך יש כפתור
        העתקה — מעתיקים, פותחים את Shortcuts, ומדביקים.
      </p>
    </motion.section>
  );
}

function Step({
  n,
  title,
  body,
  icon,
}: {
  n: number;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: n * 0.04 }}
      className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-neon/10 text-neon">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-neon/20 text-[10px] text-neon">
              {n}
            </span>
            שלב
          </div>
          <h2 className="mt-0.5 text-sm font-medium text-foreground">{title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

function ActionMockup({
  webhookUrl,
  deviceId,
}: {
  webhookUrl: string;
  deviceId: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-1.5 shadow-[0_30px_80px_-50px_rgba(0,229,255,0.4)]"
    >
      <div className="rounded-[18px] border border-white/5 bg-[#101013] p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <ArrowDownToLine className="size-3.5 text-neon" />
          קבלת התוכן של URL
        </div>

        {/* URL row */}
        <Row label="URL" gold>
          <CopyChip value={webhookUrl} />
        </Row>

        {/* Method row */}
        <Row label="שיטה (Method)" gold>
          <span className="inline-flex items-center rounded-lg border border-neon/40 bg-neon/10 px-3 py-1.5 text-[12px] font-medium text-neon" style={{ direction: "ltr" }}>
            POST
          </span>
        </Row>

        {/* Headers section */}
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            כותרות (Headers)
          </div>
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/30 p-2">
            <HeaderRow keyName="Content-Type" value="application/json" />
            <HeaderRow keyName="x-sally-device" value={deviceId} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function Row({
  label,
  gold,
  children,
}: {
  label: string;
  gold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div
        className={`mb-1 text-[10px] uppercase tracking-[0.25em] ${gold ? "text-gold/80" : "text-neon/80"}`}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function HeaderRow({ keyName, value }: { keyName: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white/[0.02] p-2">
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.2em] text-neon/70">
          שם הכותרת
        </div>
        <div
          data-mono="true"
          className="text-[12px] text-foreground"
          style={{ direction: "ltr", textAlign: "left" }}
        >
          {keyName}
        </div>
      </div>
      <CopyChip label="ערך הכותרת" value={value} />
    </div>
  );
}

function BodyMockup() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-1.5 shadow-[0_30px_80px_-50px_rgba(212,175,55,0.4)]"
    >
      <div className="rounded-[18px] border border-white/5 bg-[#101013] p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <span>בקשת גוף (Body)</span>
          <span
            className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold"
            style={{ direction: "ltr" }}
          >
            JSON
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          לחצי <strong className="text-foreground">+ הוספת שדה חדש</strong> →
          בחרי <strong className="text-foreground">טקסט</strong>. תקלידי{" "}
          <span className="text-neon">קודם את שם השדה</span>, אחר כך{" "}
          <span className="text-gold">את הערך</span>. ככה{" "}
          <strong className="text-foreground">בדיוק</strong> זה צריך להיראות:
        </p>

        <BodyField
          keyName="issuer"
          valueLabel="cal"
          valueCopy="cal"
          valueIsLiteral
          note='הערך "cal" באנגלית קטנה. אם autocorrect הופך ל־"Cal" עם C גדולה — מחקי ותקלידי שוב.'
        />

        <BodyField
          keyName="smsBody"
          valueLabel="◇ Shortcut Input"
          valueCopy={SAMPLE_BANK_SMS}
          valueIsLiteral={false}
          note="זה לא טקסט שמקלידים — זה Variable. הקליקי על האייקון הקטן של ה־Variables (יהלום או חץ) ובחרי 'Shortcut Input' או 'תוכן'. לבדיקה ראשונית בלי לחכות ל־SMS אמיתי, אפשר להעתיק את הטקסט לדוגמה ולהדביק כטקסט."
        />

        <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-black/40 p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-neon" />
          <span>
            סדר הקלדה <strong className="text-foreground">קריטי</strong>:
            הקלקה ראשונה היא תמיד על שם השדה (issuer / smsBody) ואחר כך על
            הערך (cal / הוריאיבל). אם תהפכי — iOS שומר אותם הפוך וה־server
            יחזיר schema_violation.
          </span>
        </div>
      </div>
    </motion.section>
  );
}

function BodyField({
  keyName,
  valueLabel,
  valueCopy,
  valueIsLiteral,
  note,
}: {
  keyName: string;
  valueLabel: string;
  valueCopy: string;
  valueIsLiteral: boolean;
  note: string;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="grid grid-cols-2 gap-2">
        {/* Key column — neon (cyan) */}
        <div className="rounded-lg border border-neon/30 bg-neon/[0.05] p-2.5">
          <div className="text-[9px] uppercase tracking-[0.2em] text-neon">
            ① שם השדה
          </div>
          <div
            data-mono="true"
            className="mt-1 text-[13px] font-medium text-foreground"
            style={{ direction: "ltr", textAlign: "left" }}
          >
            {keyName}
          </div>
          <div className="mt-1.5">
            <CopyChip value={keyName} />
          </div>
        </div>

        {/* Value column — gold */}
        <div className="rounded-lg border border-gold/30 bg-gold/[0.05] p-2.5">
          <div className="text-[9px] uppercase tracking-[0.2em] text-gold">
            ② הערך
          </div>
          <div
            className="mt-1 text-[13px] font-medium text-foreground"
            style={{
              direction: valueIsLiteral ? "ltr" : "rtl",
              textAlign: valueIsLiteral ? "left" : "right",
            }}
          >
            {valueLabel}
          </div>
          <div className="mt-1.5">
            {valueIsLiteral ? (
              <CopyChip value={valueCopy} />
            ) : (
              <div className="space-y-1">
                <span className="block text-[10px] text-muted-foreground">
                  לחצי על אייקון Variables → Shortcut Input
                </span>
                <CopyChip
                  label="או טקסט-בדיקה"
                  value={valueCopy}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function CommonMistakes() {
  const items: Array<{ ok: boolean; text: string }> = [
    { ok: true, text: 'שם שדה ראשון בדיוק "issuer", לא "Issuer" ולא רווח אחרי' },
    { ok: true, text: 'ערך ראשון בדיוק "cal" (ולא "Cal" עם C גדולה)' },
    { ok: true, text: 'שם שדה שני בדיוק "smsBody" (B גדולה באמצע)' },
    { ok: true, text: "ערך שני: Shortcut Input (Variable) או טקסט באורך 20+ תווים" },
    { ok: false, text: 'לא להחליף את "issuer" ב־"cal" כשם השדה' },
    { ok: false, text: "לא לבחור סוג שדה Number/Boolean/Dictionary — רק טקסט" },
    { ok: false, text: "לא להקליד טקסט קצר (פחות מ-20 תווים) ב־smsBody" },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-md">
      <div className="mb-3 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        טעויות נפוצות שתפסתי
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[12px] text-foreground/90"
          >
            {it.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#34D399]" />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            )}
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
