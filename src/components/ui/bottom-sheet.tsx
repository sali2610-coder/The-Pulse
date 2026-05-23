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
};

// Velocity threshold for "throw to dismiss" — combined with the
// position threshold below so a quick downward flick closes the
// sheet even if the user didn't drag past the visual midpoint.
const DISMISS_VELOCITY = 600;
const DISMISS_DISTANCE = 110;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  noHandle = false,
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
                  drag={reduced ? false : "y"}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, info) => {
                    if (
                      info.offset.y > DISMISS_DISTANCE ||
                      info.velocity.y > DISMISS_VELOCITY
                    ) {
                      onOpenChange(false);
                    }
                  }}
                  className={cn(
                    "glass-card pb-safe-plus fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-4 rounded-t-[28px] px-5 pt-3 shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.55)]",
                    className,
                  )}
                />
              }
            >
              {!noHandle && (
                <div
                  aria-hidden
                  className="mx-auto h-1.5 w-12 rounded-full bg-white/20 transition-colors"
                />
              )}
              {title && (
                <DialogPrimitive.Title className="sr-only">
                  {title}
                </DialogPrimitive.Title>
              )}
              <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain pb-2">
                {children}
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
