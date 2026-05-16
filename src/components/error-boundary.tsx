"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Renders when a descendant throws. If omitted, renders `null`. */
  fallback?: ReactNode;
  /** Optional label used in console logs to identify the offending area. */
  name?: string;
};
type State = { error: Error | null };

// Generic error boundary used at three levels:
//   1. Top-level wrap around `<Home>` so a render crash shows a branded
//      recovery panel instead of Safari's "couldn't load".
//   2. Per-card on the dashboard so one broken tile doesn't bring the
//      whole page down.
//   3. Anywhere else (analytics tab, history tab, etc.) where shielding
//      siblings from a sub-tree crash is desirable.

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (typeof window !== "undefined") {
      const tag = this.props.name ? `[${this.props.name}]` : "[render]";
      console.warn(`${tag} caught error`, error);
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

/** Branded full-screen fallback for the root page boundary. */
export function PageFallback({ error }: { error?: Error }) {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#0a0a0a",
        color: "#f5f5f5",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
        gap: "1rem",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.24em",
          color: "#D4AF37",
          textTransform: "uppercase",
        }}
      >
        Sally
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 300, margin: 0 }}>
        משהו השתבש בעת הטעינה
      </h1>
      <p style={{ color: "#A1A1AA", fontSize: 13, maxWidth: 360 }}>
        אפשר לנקות את המטמון המקומי ולנסות שוב.
      </p>
      {error?.message ? (
        <pre
          style={{
            maxWidth: 380,
            maxHeight: 120,
            overflow: "auto",
            fontSize: 11,
            color: "#A1A1AA",
            background: "rgba(255,255,255,0.04)",
            padding: "0.75rem",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            direction: "ltr",
            textAlign: "left",
          }}
        >
          {error.message}
        </pre>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <a
          href="/lite"
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: 12,
            background: "linear-gradient(180deg, #34D399 0%, #10B981 100%)",
            color: "#062E1B",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          נקה ונסה שוב
        </a>
        <a
          href="/debug"
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#F5F5F5",
            textDecoration: "none",
          }}
        >
          דף בדיקה
        </a>
      </div>
    </main>
  );
}
