"use client";

// Tap-to-Pulse diagnostic card. Reworked May 2026 to fix the
// "stuck on בודק רישום קיים..." production bug:
//
//   * Every async probe is wrapped in withTimeout(4s) so a slow
//     network or hung SW promise can't strand the UI.
//   * The render is driven by a pure state machine
//     (classifyPushDiagnostic) instead of a single loading boolean.
//     Every refresh ends in a final state: idle / checking /
//     unsupported / permission_denied / waiting_for_sw /
//     no_subscription / subscribed_browser_only /
//     subscribed_server_only / subscribed_synced / send_ok /
//     send_failed / timed_out.
//   * If the user is currently foregrounded inside the PWA, we show
//     a Hebrew explainer telling them iOS suppresses notifications
//     in that mode — so a missing toast isn't read as a bug.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, RefreshCw } from "lucide-react";

import { getOrCreateDeviceId } from "@/lib/device-id";
import {
  classifyPushDiagnostic,
  foregroundNote,
  labelFor,
  PROBE_TIMEOUT_MS,
  withTimeout,
  type PushDiagStatus,
} from "@/lib/push-diagnostic-state";
import {
  nativePlatformLabel,
  readLastNativeRegistration,
  type LastNativeRegistration,
} from "@/lib/native/push";
import { isNative } from "@/lib/native/platform";

type ServerDiag = {
  ok: boolean;
  vapidConfigured?: boolean;
  kvConfigured?: boolean;
  apnsConfigured?: boolean;
  fcmConfigured?: boolean;
  subscription: {
    endpoint: string;
    endpointHost?: string;
    registeredAt: number;
  } | null;
  nativeTokens?: Array<{
    platform: "ios" | "android";
    tokenPreview: string;
    deviceId: string;
    appVersion?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  lastAttempt: {
    ts: number;
    ok: boolean;
    gone: boolean;
    status?: number;
    reason?: string;
    endpointHost?: string;
    externalId?: string;
  } | null;
};

type BrowserDiag = {
  pushSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  swRegistered: boolean;
  swActive: boolean;
  swController: boolean;
  swScope?: string;
  localEndpoint?: string;
  localEndpointHost?: string;
  standalone: boolean;
  iosVersion?: string;
};

function endpointHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

async function probeBrowser(): Promise<BrowserDiag> {
  if (typeof window === "undefined") {
    return {
      pushSupported: false,
      notificationPermission: "unsupported",
      swRegistered: false,
      swActive: false,
      swController: false,
      standalone: false,
    };
  }
  const pushSupported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const notificationPermission: NotificationPermission | "unsupported" =
    "Notification" in window ? Notification.permission : "unsupported";

  let swRegistered = false;
  let swActive = false;
  let swScope: string | undefined;
  let localEndpoint: string | undefined;
  if ("serviceWorker" in navigator) {
    // Each SW call is independently timed so a single hang doesn't
    // abort the whole probe — we want partial signals over none.
    const regResult = await withTimeout(
      navigator.serviceWorker.getRegistration(),
    );
    if (regResult.ok && regResult.value) {
      const reg = regResult.value;
      swRegistered = true;
      swActive = Boolean(reg.active);
      swScope = reg.scope;
      const subResult = await withTimeout(
        reg.pushManager.getSubscription().catch(() => null),
      );
      if (subResult.ok && subResult.value) localEndpoint = subResult.value.endpoint;
    }
  }
  const swController = Boolean(navigator.serviceWorker?.controller);

  const nav = navigator as unknown as { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    false;

  let iosVersion: string | undefined;
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
  if (m) iosVersion = `${m[1]}.${m[2]}${m[3] ? "." + m[3] : ""}`;

  return {
    pushSupported,
    notificationPermission,
    swRegistered,
    swActive,
    swController,
    swScope,
    localEndpoint,
    localEndpointHost: endpointHost(localEndpoint),
    standalone,
    iosVersion,
  };
}

function fmtTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ts));
  } catch {
    return String(ts);
  }
}

export function PushDiagnostics() {
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<ServerDiag | null>(null);
  const [browser, setBrowser] = useState<BrowserDiag | null>(null);
  const [status, setStatus] = useState<PushDiagStatus>("idle");
  const [foregroundExplainer, setForegroundExplainer] = useState<string | null>(
    null,
  );
  const [lastNative, setLastNative] = useState<LastNativeRegistration | null>(
    null,
  );
  const nativePlatform = nativePlatformLabel();
  const isNativeShell = isNative();

  const refresh = useCallback(async () => {
    setStatus("checking");
    const serverPromise = fetch("/api/push/diag", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "x-sally-device": getOrCreateDeviceId() },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? (r.json() as Promise<ServerDiag>) : null))
      .catch(() => null);

    const [serverResult, browserResult] = await Promise.all([
      withTimeout(serverPromise),
      withTimeout(probeBrowser()),
    ]);

    const s = serverResult.ok ? serverResult.value : null;
    const b = browserResult.ok ? browserResult.value : null;
    setServer(s);
    setBrowser(b);

    const next = classifyPushDiagnostic({
      pushSupported: b?.pushSupported ?? false,
      notificationPermission: b?.notificationPermission ?? null,
      swRegistered: b?.swRegistered ?? false,
      swActive: b?.swActive ?? false,
      localEndpoint: b?.localEndpoint ?? null,
      serverEndpoint: s?.subscription?.endpoint ?? null,
      lastSendOk: s?.lastAttempt?.ok ?? null,
      probeTimedOut: !serverResult.ok && !browserResult.ok,
    });
    setStatus(next);

    if (b) {
      setForegroundExplainer(
        foregroundNote({
          visibilityState:
            typeof document !== "undefined" ? document.visibilityState : "hidden",
          standalone: b.standalone,
          iosVersion: b.iosVersion ?? null,
        }),
      );
    }
    setLastNative(readLastNativeRegistration());
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen && status === "idle") {
        void refresh();
      }
      return !wasOpen;
    });
  }, [status, refresh]);

  // Refresh whenever the user returns to the tab — keeps the status
  // honest after iOS swaps the SW out, the user grants permission in
  // Settings, or the network recovers.
  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, refresh]);

  const serverHost = server?.subscription?.endpointHost;
  const localHost = browser?.localEndpointHost;
  const endpointMatch =
    serverHost && localHost ? serverHost === localHost : null;

  const statusTone =
    status === "subscribed_synced" || status === "send_ok"
      ? "ok"
      : status === "checking" || status === "waiting_for_sw"
        ? "wait"
        : status === "idle"
          ? "wait"
          : "warn";

  return (
    <div className="border-t border-white/8 pt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span>אבחון Tap-to-Pulse</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="size-3" />
        </motion.span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-white/8 bg-background/40 p-3 text-[11px]">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>מצב נוכחי</span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={status === "checking"}
              className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] hover:border-white/20 disabled:opacity-50"
              aria-label="רענן אבחון"
            >
              <RefreshCw
                className={`size-3 ${status === "checking" ? "animate-spin" : ""}`}
              />
              רענן
            </button>
          </div>

          {/* Authoritative final state — always rendered. */}
          <div
            className={`rounded-xl border px-3 py-2 text-[11.5px] ${
              statusTone === "ok"
                ? "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                : statusTone === "warn"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-white/10 bg-white/5 text-muted-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {labelFor(status)}
          </div>

          {foregroundExplainer ? (
            <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-[10.5px] text-gold">
              {foregroundExplainer}
            </p>
          ) : null}

          <Row label="server endpoint host">
            <Mono>{serverHost ?? "—"}</Mono>
          </Row>
          <Row label="browser endpoint host">
            <Mono>{localHost ?? "—"}</Mono>
          </Row>
          <Row label="endpoint match">
            <Pill
              value={endpointMatch}
              positiveLabel="זהה"
              negativeLabel="שונה"
              neutralLabel="לא ידוע"
            />
          </Row>
          <Row label="last push attempted">
            <Mono>
              {server?.lastAttempt ? fmtTime(server.lastAttempt.ts) : "—"}
            </Mono>
          </Row>
          <Row label="last push status">
            <Mono>
              {server?.lastAttempt?.status
                ? String(server.lastAttempt.status)
                : "—"}
            </Mono>
          </Row>
          <Row label="last push reason">
            <Mono>{server?.lastAttempt?.reason ?? "—"}</Mono>
          </Row>
          <Row label="service worker registered">
            <Pill value={browser?.swRegistered ?? null} />
          </Row>
          <Row label="service worker active">
            <Pill value={browser?.swActive ?? null} />
          </Row>
          <Row label="service worker controller">
            <Pill value={browser?.swController ?? null} />
          </Row>
          <Row label="sw scope">
            <Mono>{browser?.swScope ?? "—"}</Mono>
          </Row>
          <Row label="notification permission">
            <Mono>{browser?.notificationPermission ?? "—"}</Mono>
          </Row>
          <Row label="standalone PWA mode">
            <Pill
              value={browser?.standalone ?? null}
              negativeLabel="לא — חובה Add to Home Screen"
            />
          </Row>
          <Row label="iOS version">
            <Mono>{browser?.iosVersion ?? "—"}</Mono>
          </Row>
          <Row label="VAPID configured">
            <Pill value={server?.vapidConfigured ?? null} />
          </Row>
          <Row label="KV configured">
            <Pill value={server?.kvConfigured ?? null} />
          </Row>

          {/* ── Native push (Phase 203) ─────────────────────────── */}
          <div className="mt-2 border-t border-white/8 pt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Native push
          </div>
          <Row label="native platform">
            <Mono>{nativePlatform}</Mono>
          </Row>
          <Row label="native shell">
            <Pill
              value={isNativeShell}
              positiveLabel="כן"
              negativeLabel="לא — מצב web/PWA"
            />
          </Row>
          <Row label="fallback mode">
            <Mono>{isNativeShell ? "native+web" : "web"}</Mono>
          </Row>
          <Row label="APNs configured (server)">
            <Pill value={server?.apnsConfigured ?? null} />
          </Row>
          <Row label="FCM configured (server)">
            <Pill value={server?.fcmConfigured ?? null} />
          </Row>
          <Row label="native tokens registered">
            <Mono>
              {server?.nativeTokens && server.nativeTokens.length > 0
                ? server.nativeTokens.map((t) => t.platform).join(", ")
                : "—"}
            </Mono>
          </Row>
          {server?.nativeTokens?.map((t) => (
            <Row key={t.platform} label={`token (${t.platform})`}>
              <Mono>{t.tokenPreview}</Mono>
            </Row>
          )) ?? null}
          <Row label="last native attempt">
            <Mono>{lastNative ? fmtTime(lastNative.ts) : "—"}</Mono>
          </Row>
          <Row label="last native result">
            <Pill
              value={lastNative ? lastNative.ok : null}
              positiveLabel={lastNative?.platform ?? "ok"}
              negativeLabel={lastNative?.reason ?? "fail"}
              neutralLabel="—"
            />
          </Row>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/4 py-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

function Pill({
  value,
  positiveLabel = "yes",
  negativeLabel = "no",
  neutralLabel = "—",
}: {
  value: boolean | null | undefined;
  positiveLabel?: string;
  negativeLabel?: string;
  neutralLabel?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-muted-foreground">
        {neutralLabel}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        value
          ? "bg-[#34D399]/15 text-[#34D399]"
          : "bg-destructive/15 text-destructive"
      }`}
    >
      {value ? positiveLabel : negativeLabel}
    </span>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-mono="true"
      dir="ltr"
      className="font-mono text-[10px] text-foreground"
    >
      {children}
    </span>
  );
}
