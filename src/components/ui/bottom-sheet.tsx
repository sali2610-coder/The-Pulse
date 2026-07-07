"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING_SOFT, FADE_QUICK, REDUCED } from "@/lib/motion-tokens";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title rendered for accessibility — kept visually hidden by default;
   *  components can render their own visible title. */
  title?: string;
  children: React.ReactNode;
  /** Optional className applied to the sheet body. */
  className?: string;
  /** If true, suppress the drag-down-to-dismiss handle. */
  noHandle?: boolean;
  /** Phase 326 — fills the entire viewport (modulo safe-area top) for
   *  premium form flows where partial-height feels cramped. */
  fullScreen?: boolean;
  /** Phase 326 — optional sticky footer rendered under the scrollable
   *  body. Footer stays pinned to the bottom over the safe-area pad
   *  so action buttons never get pushed off-screen by content. */
  footer?: React.ReactNode;
  /** Phase 329 — when true the drag gesture stays for elastic feel
   *  but never closes the sheet. Action surfaces (expense entry)
   *  rely on explicit ביטול / שמור buttons; an accidental tiny
   *  downward drag must not blow away the user's typed values. */
  lockDismiss?: boolean;
};

const DISMISS_VELOCITY = 600;
const DISMISS_DISTANCE = 110;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  noHandle = false,
  fullScreen = false,
  footer,
  lockDismiss = false,
}: BottomSheetProps) {
  const reduced = useReducedMotion();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal keepMounted>
            <DialogPrimitive.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduced ? REDUCED : FADE_QUICK}
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
                />
              }
            />
            <DialogPrimitive.Popup
              render={
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={reduced ? REDUCED : SPRING_SOFT}
                  // Framer's pan gesture always calls setPointerCapture on
                  // pointer-down. When lockDismiss is on, drag can't
                  // dismiss anyway — but keeping `drag="y"` here steals
                  // pointer events from every nested <button> (Save /
                  // Add / delete). The result is a Save button that
                  // "looks disabled" because clicks never reach it.
                  // Drag stays enabled only for the free (dismissible)
                  // variant so the drag-to-close gesture still works.
                  drag={reduced || lockDismiss ? false : "y"}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, info) => {
                    if (lockDismiss) return;
                    if (
                      info.offset.y > DISMISS_DISTANCE ||
                      info.velocity.y > DISMISS_VELOCITY
                    ) {
                      onOpenChange(false);
                    }
                  }}
                  className={cn(
                    "glass-card fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col rounded-t-[28px] shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.55)]",
                    fullScreen
                      ? "top-[max(env(safe-area-inset-top),24px)] max-h-[100dvh] gap-3 px-5 pt-3"
                      : "pb-safe-plus max-h-[92dvh] gap-4 px-5 pt-3",
                    className,
                  )}
                />
              }
            >
              {!noHandle && (
                <div
                  aria-hidden
                  className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-white/20 transition-colors"
                />
              )}
              {title && (
                <DialogPrimitive.Title className="sr-only">
                  {title}
                </DialogPrimitive.Title>
              )}
              <div
                className={cn(
                  "flex flex-col gap-4 overflow-y-auto overscroll-contain pb-2",
                  fullScreen ? "min-h-0 flex-1" : "",
                  // Hide native scrollbar — the white sidebar that
                  // showed on iOS Safari was the form body's overflow
                  // scrollbar bleeding through the rounded corners.
                  "[&::-webkit-scrollbar]:hidden [scrollbar-width:none]",
                )}
              >
                {children}
              </div>
              {footer ? (
                <div className="pb-safe-plus shrink-0 border-t border-white/8 bg-black/40 px-1 pt-3 backdrop-blur-md">
                  {footer}
                </div>
              ) : null}
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
