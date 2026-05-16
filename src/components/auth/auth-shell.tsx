"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Optional CTA shown below the form (e.g. "Already have an account?"). */
  footer?: React.ReactNode;
};

/**
 * Branded shell for sign-in / sign-up pages. Premium glass card on the
 * dark Sally surface so the auth flow doesn't feel like a stock Clerk
 * widget glued onto a blank page.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main
      className="relative flex min-h-[100dvh] flex-col items-stretch px-5 sm:items-center"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 2.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
      }}
    >
      {/* Aurora glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="animate-aurora absolute -top-32 -end-24 size-80 rounded-full bg-[color:var(--neon)]/12 blur-3xl" />
        <div className="animate-aurora absolute -bottom-40 -start-32 size-96 rounded-full bg-gold/10 blur-3xl" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-5">
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-1 pt-4 text-center"
        >
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.32em] text-gold/80">
            <Sparkles className="h-3 w-3" strokeWidth={1.6} />
            Sally
          </div>
          <h1 className="text-2xl font-light leading-tight tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45 }}
          className="glass-card rounded-3xl p-5"
        >
          {children}
        </motion.section>

        {footer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-center text-xs text-muted-foreground"
          >
            {footer}
          </motion.div>
        )}

        <Link
          href="/"
          className="mx-auto flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          חזרה לדאשבורד
        </Link>
      </div>
    </main>
  );
}
