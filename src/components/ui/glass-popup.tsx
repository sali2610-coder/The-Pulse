"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING_SOFT, FADE_QUICK } from "@/lib/motion-tokens";

/**
 * Compact "Dynamic Island" capsule popup.
 *
 * Anchored to the top-center of the viewport, hugging the Dynamic
 * Island region on supported iPhones. Floats over the dimmed
 * background with a soft neon ambient glow so it reads as a Live
 * Activity card, not a screen-takeover modal.
 *
 * Width adapts to viewport: ~min(92vw, 320px) so it never stretches
 * into the safe-area edges on tablets or compresses uncomfortably on
 * small phones.
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
                  transition={FADE_QUICK}
                  className="fixed inset-0 z-50 bg-black/50 backdrop-blur-lg"
                />
              }
            />
            <DialogPrimitive.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -10 }}
                  transition={SPRING_SOFT}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 60 || info.velocity.y > 480) {
                      onOpenChange(false);
                    }
                  }}
                  className={cn(
                    // Floats horizontally centered, adapts width.
                    "fixed inset-x-0 z-50 mx-auto flex w-[min(92vw,320px)] flex-col px-2",
                    className,
                  )}
                  style={{
                    top: "max(env(safe-area-inset-top), 8px)",
                  }}
                />
              }
            >
              <div
                className={cn(
                  // Capsule glass body.
                  "relative overflow-hidden rounded-[34px] border border-white/12",
                  "bg-gradient-to-b from-white/[0.08] to-white/[0.025]",
                  "backdrop-blur-xl",
                  // Softer inset highlight + neon-tinted ambient glow.
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_18px_56px_-18px_rgba(0,229,255,0.22),0_36px_90px_-30px_rgba(0,0,0,0.70)]",
                )}
              >
                {/* Slim drag handle */}
                <div className="flex justify-center pt-1.5">
                  <div className="h-[3px] w-7 rounded-full bg-white/22" />
                </div>
                {title && (
                  <DialogPrimitive.Title className="sr-only">
                    {title}
                  </DialogPrimitive.Title>
                )}
                <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-1">
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
