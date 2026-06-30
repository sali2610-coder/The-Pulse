"use client";

// Phase 430 · AURORA v1 — Screen
//
// Generic page wrapper. Two responsibilities:
//   1. Layer TopBar (sticky), main content (scrolls), BottomNav
//      (fixed) into a coherent stack.
//   2. Apply safe-area + content-max + gutter so every screen has
//      identical padding behavior across iPhone sizes.
//
// Children compose freely inside `<main>`. No card chrome, no
// background — those belong to AuroraShell or content components.
//
// Props
//   topBar       — optional ReactNode mounted at the top (sticky)
//   bottomNav    — optional ReactNode mounted at the bottom (fixed)
//   contentRef   — forwarded ref to the scrollable <main>; the
//                  TopBar uses this to drive its scroll-blur reveal
//   scrollSentinelRef — forwarded ref the TopBar reads via
//                       IntersectionObserver

import { forwardRef, type ReactNode, type Ref } from "react";

type ScreenProps = {
  topBar?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
  /** When true, the page hides the bottom nav (modals, onboarding). */
  hideBottomNav?: boolean;
  /** When true, the page hides the top bar (full-bleed cinema). */
  hideTopBar?: boolean;
  /** Forward ref for IntersectionObserver-based scroll detection. */
  scrollSentinelRef?: Ref<HTMLDivElement>;
};

export const Screen = forwardRef<HTMLElement, ScreenProps>(function Screen(
  {
    topBar,
    bottomNav,
    children,
    hideBottomNav = false,
    hideTopBar = false,
    scrollSentinelRef,
  },
  ref,
) {
  return (
    <div className="aurora-screen relative z-10 flex min-h-[100svh] flex-col">
      {hideTopBar ? null : topBar}
      <main
        ref={ref}
        className="aurora-screen-main relative flex-1"
        // Inline styles only for tokens; class-only layout.
        style={{
          paddingBlockStart: hideTopBar
            ? "calc(var(--aurora-safe-top) + var(--aurora-space-4))"
            : "0",
          paddingBlockEnd: hideBottomNav
            ? "calc(var(--aurora-safe-bottom) + var(--aurora-space-4))"
            : "calc(var(--aurora-bottom-nav-h) + var(--aurora-space-4))",
        }}
      >
        {/* Scroll sentinel — first 1pt of content. When it leaves
            the viewport, TopBar reveals its blur + bottom hairline. */}
        <div
          ref={scrollSentinelRef}
          aria-hidden
          className="aurora-screen-sentinel"
        />
        <div className="aurora-screen-content mx-auto w-full">
          {children}
        </div>
      </main>
      {hideBottomNav ? null : bottomNav}
    </div>
  );
});
