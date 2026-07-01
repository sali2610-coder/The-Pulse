"use client";

// Phase 447 · AURORA integration primitives.
//
// Consolidates repeat patterns that had grown up per-center: empty
// states, error boundaries, quick-jump section anchors, tap haptics.
// UI-only glue; no engine behaviour.

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SVGProps,
} from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ErrorBoundary } from "@/components/error-boundary";
import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { tap as hapticTap } from "@/lib/haptics";

// ── AuroraEmpty ──────────────────────────────────────────────
// Unified empty-state shell that every recovery center can drop
// into when its data source has nothing to say.

export function AuroraEmpty({
  eyebrow,
  title,
  body,
  action,
  tone = "quiet",
}: {
  eyebrow?: string;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "quiet" | "warn" | "safe";
}) {
  const border =
    tone === "warn"
      ? "rgba(250, 204, 21, 0.35)"
      : tone === "safe"
        ? "rgba(52, 211, 153, 0.35)"
        : "var(--aurora-hairline-quiet)";
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-empty-state-hero" style={{ borderColor: border }}>
        <span aria-hidden className="aurora-empty-orb" />
        <div className="aurora-empty-state-body">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h3 className="aurora-empty-state-title">{title}</h3>
          <p className="aurora-body aurora-ink-3">{body}</p>
          {action ? <div className="aurora-empty-state-action">{action}</div> : null}
        </div>
      </div>
    </GlassCard>
  );
}

// ── AuroraCenterBoundary ─────────────────────────────────────
// Wraps a recovery center so one throwing screen never nukes Home.
// Renders a compact aurora fallback that keeps the shell coherent.

export function AuroraCenterBoundary({
  name,
  title = "המרכז הזה נכשל להיטען",
  children,
}: {
  name: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      name={name}
      fallback={<CenterFallback title={title} name={name} />}
    >
      {children}
    </ErrorBoundary>
  );
}

function CenterFallback({ title, name }: { title: string; name: string }) {
  return (
    <AuroraEmpty
      eyebrow={name}
      title={title}
      body="ניסינו לרנדר את המרכז הזה ונתקלנו בשגיאה. שאר המסך ממשיך לעבוד רגיל. רענון הדף בדרך כלל פותר."
      tone="warn"
    />
  );
}

// ── AuroraSectionAnchor ──────────────────────────────────────
// Standardised anchor block. Any center that wants to be reachable
// from the quick-jump strip renders this as its outer wrapper.

export function AuroraSectionAnchor({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <div id={`aurora-anchor-${id}`} data-aurora-anchor={id}>
      {children}
    </div>
  );
}

// ── Quick-jump navigation strip ──────────────────────────────

export type AuroraJumpItem = {
  id: string;
  label: string;
  icon?: ReactElement<SVGProps<SVGSVGElement>>;
};

export function AuroraJumpStrip({ items }: { items: AuroraJumpItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const observers = useRef<IntersectionObserver | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;
    observers.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute("data-aurora-anchor");
          if (id) setActiveId(id);
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0.1, 0.5, 0.9] },
    );
    observers.current = observer;
    for (const item of items) {
      const el = document.querySelector(`[data-aurora-anchor="${item.id}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  const jumpTo = useCallback((id: string) => {
    const el = document.querySelector(`[data-aurora-anchor="${id}"]`);
    if (el) {
      hapticTap();
      (el as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, []);

  return (
    <nav
      className="aurora-jump-strip"
      aria-label="קפיצה מהירה בין מרכזים"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => jumpTo(item.id)}
            className="aurora-jump-chip"
            data-aurora-active={active ? "true" : "false"}
            aria-current={active ? "true" : undefined}
            whileTap={reduced ? undefined : { scale: 0.96 }}
          >
            {active ? (
              <motion.span
                layoutId="aurora-jump-pill"
                aria-hidden
                className="aurora-jump-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            {item.icon ? cloneElementWithClass(item.icon, "aurora-jump-icon") : null}
            <span className="aurora-jump-label">{item.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}

function cloneElementWithClass(
  el: ReactElement<SVGProps<SVGSVGElement>>,
  className: string,
): ReactElement<SVGProps<SVGSVGElement>> {
  if (!isValidElement(el)) return el;
  const original = el.props.className ?? "";
  return cloneElement(el, {
    className: `${original} ${className}`.trim(),
  });
}

// ── Haptic passthrough wrapper ───────────────────────────────
// Any button that wants to feel a subtle tap on iOS PWAs can wrap
// its onClick with this. Kept as a hook so callers don't hand-import
// the haptics module.

export function useHapticClick(onClick?: () => void) {
  return useCallback(() => {
    hapticTap();
    onClick?.();
  }, [onClick]);
}
