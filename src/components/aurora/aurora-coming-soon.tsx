"use client";

// Phase 433 · AURORA v1 — ComingSoon screen primitive
//
// Polished placeholder used for Timeline / Settings until their
// full screens land. Aurora language: orb + headline + body + list
// of items already shipped from the same domain. Never a dead click.

import { motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";

export type ComingSoonItem = {
  key: string;
  label: string;
  hint?: string;
};

export function ComingSoonScreen({
  eyebrow,
  title,
  body,
  items,
}: {
  eyebrow: string;
  title: string;
  body: string;
  items?: ComingSoonItem[];
}) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-coming-stack">
      <motion.div
        className="aurora-coming-hero"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0.12 : 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <span aria-hidden className="aurora-coming-orb" />
        <Eyebrow srHeading={{ level: 1, text: title }}>{eyebrow}</Eyebrow>
        <h2 className="aurora-coming-title">{title}</h2>
        <p className="aurora-body-l aurora-ink-2 aurora-coming-body">{body}</p>
      </motion.div>

      {items && items.length > 0 ? (
        <GlassCard elevation="elev-1" padding="spacious" radius="hero">
          <Eyebrow srHeading={{ level: 2, text: "מה כבר עובד מהמסך הזה" }}>
            כבר זמין במסך הבית
          </Eyebrow>
          <ul className="aurora-coming-list">
            {items.map((it) => (
              <li key={it.key}>
                <span aria-hidden className="aurora-coming-bullet" />
                <div className="aurora-coming-item-body">
                  <span className="aurora-coming-item-label">{it.label}</span>
                  {it.hint ? (
                    <span className="aurora-coming-item-hint">{it.hint}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
