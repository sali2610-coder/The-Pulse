// Native + web lifecycle subscriber.
//
// Single registration point for "app came back to the foreground"
// events. Capacitor's @capacitor/app emits 'appStateChange' on iOS
// and Android; the web fallback listens to visibilitychange so a
// PWA / browser tab gets the same callback shape.
//
// Existing sync triggers (useAutoSync visibilitychange listener,
// cloud-sync reconnectTick) are NOT replaced — this layer is a
// SECOND, well-named entry point future native code can plug into
// without re-deriving Capacitor's plugin surface.

import { isNative } from "./platform";

export type LifecycleEvent = "resumed" | "backgrounded";

export type LifecycleListener = (event: LifecycleEvent) => void;

const listeners = new Set<LifecycleListener>();
let started = false;
let nativeUnsubscribe: (() => void) | null = null;

export function onLifecycle(listener: LifecycleListener): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: LifecycleEvent): void {
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.warn("[lifecycle] listener threw:", err);
    }
  }
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  if (typeof window === "undefined") return;

  // Web path — visibilitychange covers PWA + browser tabs.
  const onVisible = () => {
    if (document.visibilityState === "visible") emit("resumed");
    else emit("backgrounded");
  };
  document.addEventListener("visibilitychange", onVisible);

  // Native path — wire Capacitor App plugin when present. Loaded
  // lazily so the web bundle doesn't pay for the import.
  if (isNative()) {
    void wireNativeListener();
  }
}

async function wireNativeListener(): Promise<void> {
  try {
    const mod = await import("@capacitor/app");
    const App = mod.App;
    const handle = await App.addListener("appStateChange", (state) => {
      emit(state.isActive ? "resumed" : "backgrounded");
    });
    nativeUnsubscribe = () => {
      void handle.remove();
    };
  } catch (err) {
    console.warn("[lifecycle] native wiring failed:", err);
  }
}

/** Test-only: tear down listeners so a fresh suite starts clean. */
export function _stopLifecycleForTests(): void {
  listeners.clear();
  started = false;
  if (nativeUnsubscribe) {
    nativeUnsubscribe();
    nativeUnsubscribe = null;
  }
}

/** Test-only: synchronously fire an event into the dispatcher. */
export function _emitLifecycleForTests(event: LifecycleEvent): void {
  emit(event);
}
