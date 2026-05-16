"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Minimal React smoke test. Uses the root layout (Providers + MotionConfig
// + Toaster + RegisterSW) but no dashboard components, no Zustand store
// access, no Framer Motion props beyond the MotionConfig wrapper, no
// bottom sheets, no Tabs.
//
// If `/` shows "couldn't load" in Safari but this route renders fine,
// the failing component lives in the dashboard tree (likely a heavy
// motion/SVG/Tabs render path), not in the root layer.

export default function DebugReactPage() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <main style={{ padding: 24, color: "#f5f5f5", background: "#0a0a0a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Sally · /debug-react</h1>
      <p>Minimal React. Hydration tick: <strong>{tick}</strong></p>
      <p style={{ marginTop: 16 }}>
        If you see this number incrementing every second, React + the root
        Providers chain hydrate fine in Safari. The problem is in the
        dashboard component tree.
      </p>
      <ul>
        <li><a href="/debug" style={{ color: "#00E5FF" }}>/debug</a> — plain HTML, no React</li>
        <li><a href="/reset" style={{ color: "#00E5FF" }}>/reset</a> — clear cache + SW + storage</li>
        <li><Link href="/" style={{ color: "#00E5FF" }}>/</Link> — full dashboard</li>
      </ul>
    </main>
  );
}
