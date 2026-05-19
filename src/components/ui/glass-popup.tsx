"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Compact glass popup — Apple-Wallet style.
 *
 * Anchored toward the top-center of the viewport rather than the bottom
 * edge so it feels like a floating notification card, not a full-height
 * tray. Uses heavy backdrop blur + a tight glass border + a subtle
 * inner shadow to read as premium fintech chrome.
 *
 * Width capped at ~360px regardless of viewport so the card never
 * stretches awkwardly on tablets. Drags downward to dismiss like the
 * bottom-sheet, but with a smaller threshold (the card is small).
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function GlassPopup({
  open,
  onOpenChange,
  title,
  children,
  className,
}: Props) {
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
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xl"
                />
              }
            />
            <DialogPrimitive.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -12 }}
                  transition={{
                    type: "spring",
                    damping: 30,
                    stiffness: 380,
                    mass: 0.7,
                  }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 70 || info.velocity.y > 500) {
                      onOpenChange(false);
                    }
                  }}
                  className={cn(
                    // Position: top-anchored, horizontally centered.
                    "fixed inset-x-0 z-50 mx-auto flex w-full max-w-[320px] flex-col",
                    // Safe-area aware top offset.
                    "px-3",
                    className,
                  )}
                  style={{
                    top: "max(env(safe-area-inset-top), 16px)",
                  }}
                />
              }
            >
              <div
                className={cn(
                  // Glass card body.
                  "relative overflow-hidden rounded-[28px] border border-white/14",
                  "bg-gradient-to-b from-white/[0.10] to-white/[0.04]",
                  "backdrop-blur-2xl",
                  // Premium inset highlight + drop shadow.
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_30px_80px_-20px_rgba(0,0,0,0.65)]",
                )}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-2">
                  <div className="h-1 w-9 rounded-full bg-white/18" />
                </div>
                {title && (
                  <DialogPrimitive.Title className="sr-only">
                    {title}
                  </DialogPrimitive.Title>
                )}
                <div className="flex flex-col gap-2.5 px-4 pb-4 pt-1">
                  {children}
                </div>
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
