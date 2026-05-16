"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  noHandle = false,
}: BottomSheetProps) {
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
                  transition={{
                    type: "spring",
                    damping: 32,
                    stiffness: 320,
                    mass: 0.9,
                  }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 110 || info.velocity.y > 600) {
                      onOpenChange(false);
                    }
                  }}
                  className={cn(
                    "glass-card pb-safe-plus fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-4 rounded-t-[28px] px-5 pt-3",
                    className,
                  )}
                />
              }
            >
              {!noHandle && (
                <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
              )}
              {title && (
                <DialogPrimitive.Title className="sr-only">
                  {title}
                </DialogPrimitive.Title>
              )}
              <div className="flex flex-col gap-4 overflow-y-auto pb-2">
                {children}
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
