"use client";

// Primary Action Dock · single 'מזומן' button + action menu sheet.
//
// Fixes two P0 regressions:
//   1. Dock was two side-by-side buttons (הוצאה / הכנסה) — reverted
//      to a single primary CTA labeled 'מזומן' that opens a
//      BottomSheet action menu the user can drill into.
//   2. Dock rendered as a Framer motion.div, which applied inline
//      transforms during entry. Some browsers treat this as an
//      animated containing block for fixed positioning and briefly
//      scroll the dock with the page. Root is now a plain
//      position:fixed div; the entry animation runs via a CSS
//      keyframe on the inner button so `.sally-dock-v3` itself
//      never carries a transform.
//
// Callback-only — no engine / store / dialog / navigation change.

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  HandCoins,
  Receipt,
  Wallet,
  X,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap } from "@/lib/haptics";

type ActionKey =
  | "expense"
  | "income"
  | "transfer"
  | "credit"
  | "loan";

export function PrimaryActionDock({
  onExpense,
  onIncome,
  onTransfer,
  onCredit,
  onLoan,
}: {
  onExpense: () => void;
  onIncome: () => void;
  onTransfer: () => void;
  onCredit: () => void;
  onLoan: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  // ── Dock behavior — no logic change, only position/state:
  //   • compact   — user is scrolling down (reading content); dock
  //                 shrinks + dims to stay out of the way
  //   • hidden    — a BottomSheet / Dialog is open; the dock slides
  //                 below the safe area so it never sits on top of
  //                 sheet Save/Cancel controls
  //   • idle      — user paused / scrolled up; dock returns to full
  //                 premium state
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Scroll-driven compact mode. rAF-throttled so it's cheap on the
  // main thread even at 60+ scroll events / sec.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let accumulated = 0;
    let frame = 0;
    let pending = false;
    const HIDE_DELTA = 24;
    const SHOW_DELTA = 16;
    const evaluate = () => {
      pending = false;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (y < 80) {
        setCompact(false);
        accumulated = 0;
        return;
      }
      accumulated += dy;
      if (accumulated > HIDE_DELTA) {
        setCompact(true);
        accumulated = 0;
      } else if (accumulated < -SHOW_DELTA) {
        setCompact(false);
        accumulated = 0;
      }
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(evaluate);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Sheet / dialog presence detector. Base UI's Dialog sets
  // aria-modal + role="dialog" on the popup when open; we watch the
  // DOM for any such element and hide the dock while it exists so
  // it never covers Save / Cancel controls in a sheet.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      const found = document.querySelector(
        '[role="dialog"][data-open], [role="dialog"][data-state="open"], [role="alertdialog"][data-open]',
      );
      setSheetOpen(Boolean(found));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "data-open", "role"],
    });
    return () => observer.disconnect();
  }, []);

  const dockState = sheetOpen ? "hidden" : compact ? "compact" : "idle";

  function pick(key: ActionKey) {
    hapticTap();
    setOpen(false);
    // Defer to next tick so the sheet exit doesn't overlap the
    // sheet the target action might open.
    setTimeout(() => {
      if (key === "expense") onExpense();
      else if (key === "income") onIncome();
      else if (key === "transfer") onTransfer();
      else if (key === "credit") onCredit();
      else if (key === "loan") onLoan();
    }, 40);
  }

  return (
    <>
      {/* The dock root is a plain div. Fixed positioning is defined
         in CSS. No inline transforms on this element — that keeps
         it truly fixed to the viewport regardless of scroll. */}
      <div
        className="sally-dock-v3"
        role="toolbar"
        aria-label="פעולה חדשה"
        data-state={dockState}
        aria-hidden={dockState === "hidden" ? "true" : undefined}
      >
        <span aria-hidden className="sally-dock-v3-glow" />
        <button
          type="button"
          className="sally-dock-v3-button"
          aria-label="פתח תפריט פעולות חדשות"
          aria-expanded={open}
          onClick={() => {
            hapticTap();
            setOpen(true);
          }}
        >
          <span aria-hidden className="sally-dock-v3-halo" />
          <span aria-hidden className="sally-dock-v3-icon">
            <Wallet className="size-5" strokeWidth={2.2} />
          </span>
          <span className="sally-dock-v3-text">
            <span className="sally-dock-v3-label">מזומן</span>
            <span className="sally-dock-v3-sub">פעולה חדשה</span>
          </span>
          <span aria-hidden className="sally-dock-v3-plus">
            +
          </span>
        </button>
      </div>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="פעולה חדשה"
        className="sally-actions-sheet"
      >
        <div className="sally-actions-body" dir="rtl">
          <header className="sally-actions-header">
            <div>
              <span className="sally-actions-eyebrow">מזומן · תפריט</span>
              <span className="sally-actions-title">מה תרצה לתעד?</span>
            </div>
            <button
              type="button"
              className="sally-actions-close"
              aria-label="סגור תפריט"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </header>

          <ul className="sally-actions-list" role="menu">
            <AnimatePresence initial={false}>
              <ActionRow
                delay={0.00}
                reduced={Boolean(reduced)}
                icon={<Receipt className="size-5" />}
                label="הוצאה"
                hint="תיעוד חיוב חדש"
                tone="gold"
                onClick={() => pick("expense")}
              />
              <ActionRow
                delay={0.04}
                reduced={Boolean(reduced)}
                icon={<HandCoins className="size-5" />}
                label="הכנסה"
                hint="עדכון משכורת / הפקדה"
                tone="safe"
                onClick={() => pick("income")}
              />
              <ActionRow
                delay={0.08}
                reduced={Boolean(reduced)}
                icon={<ArrowLeftRight className="size-5" />}
                label="העברה"
                hint="בין חשבונות · משיכה"
                tone="cyan"
                onClick={() => pick("transfer")}
              />
              <ActionRow
                delay={0.12}
                reduced={Boolean(reduced)}
                icon={<CreditCard className="size-5" />}
                label="אשראי"
                hint="ניהול כרטיסים ומסגרת"
                tone="purple"
                onClick={() => pick("credit")}
              />
              <ActionRow
                delay={0.16}
                reduced={Boolean(reduced)}
                icon={<Banknote className="size-5" />}
                label="הלוואה"
                hint="הוסף או ערוך הלוואה"
                tone="watch"
                onClick={() => pick("loan")}
              />
            </AnimatePresence>
          </ul>
        </div>
      </BottomSheet>
    </>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  tone,
  delay,
  reduced,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: "gold" | "safe" | "cyan" | "purple" | "watch";
  delay: number;
  reduced: boolean;
  onClick: () => void;
}) {
  return (
    <motion.li
      role="none"
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay,
        duration: reduced ? 0.12 : 0.28,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <motion.button
        type="button"
        role="menuitem"
        onClick={onClick}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="sally-actions-item"
        data-tone={tone}
      >
        <span aria-hidden className="sally-actions-item-icon">
          {icon}
        </span>
        <div className="sally-actions-item-text">
          <span className="sally-actions-item-label">{label}</span>
          <span className="sally-actions-item-hint">{hint}</span>
        </div>
        <span aria-hidden className="sally-actions-item-cue">
          ›
        </span>
      </motion.button>
    </motion.li>
  );
}
