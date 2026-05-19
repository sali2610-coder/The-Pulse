"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, RefreshCw } from "lucide-react";

import { getOrCreateDeviceId } from "@/lib/device-id";

type ServerDiag = {
  ok: boolean;
  vapidConfigured?: boolean;
  kvConfigured?: boolean;
  subscription: {
    endpoint: string;
    endpointHost?: string;
    registeredAt: number;
  } | null;
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
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        swRegistered = true;
        swActive = Boolean(reg.active);
        swScope = reg.scope;
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        if (sub) localEndpoint = sub.endpoint;
      }
    } catch {
      /* ignore */
    }
  }
  const swController = Boolean(navigator.serviceWorker?.controller);

  // iOS standalone PWA detection (Safari-specific + W3C display-mode).
  const nav = navigator as unknown as { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    false;

  // iOS major.minor from UA (best effort — Apple obscures recent versions
  // but the digits are present in the standard `Version/X.Y Safari` segment).
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
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        fetch("/api/push/diag", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "x-sally-device": getOrCreateDeviceId() },
        })
          .then((r) => r.json())
          .catch(() => null),
        probeBrowser(),
      ]);
      setServer(s as ServerDiag | null);
      setBrowser(b);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen && server === null) {
        void refresh();
      }
      return !wasOpen;
    });
  }, [server, refresh]);

  const serverHost = server?.subscription?.endpointHost;
  const localHost = browser?.localEndpointHost;
  const endpointMatch =
    serverHost && localHost ? serverHost === localHost : null;

  return (
    <div className="border-t border-white/8 pt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>אבחון Tap-to-Pulse</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="size-3" />
        </motion.span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-white/8 bg-background/40 p-3 text-[11px]">
          <div className="mb-2 flex items-center justify-between text-muted-foreground">
            <span>מצב נוכחי</span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] hover:border-white/20"
            >
              <RefreshCw
                className={`size-3 ${loading ? "animate-spin" : ""}`}
              />
              רענן
            </button>
          </div>

          <Row label="push subscription found">
            <Pill
              value={Boolean(server?.subscription)}
              positiveLabel="כן"
              negativeLabel="לא"
            />
          </Row>
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
          <Row label="last push ok">
            <Pill
              value={server?.lastAttempt ? server.lastAttempt.ok : null}
              positiveLabel="ok"
              negativeLabel="fail"
              neutralLabel="—"
            />
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
