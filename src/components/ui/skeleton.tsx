import { cn } from "@/lib/utils";

// Premium shimmer skeleton — neon-tinted to match the dashboard's gold +
// cyan palette. Use for first-paint loading states on cards that depend
// on KV reads (remote-state-sync) or async client computation.

export function Skeleton({
  className,
  shimmer = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  shimmer?: boolean;
}) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-2xl bg-white/[0.04]",
        shimmer && "shimmer-skeleton",
        className,
      )}
    />
  );
}

// Convenience variants — pre-shaped for common dashboard elements.
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        "glass-card flex flex-col gap-3 p-5",
        className,
      )}
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </Skeleton>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return <Skeleton className={cn("h-12 w-full rounded-xl", className)} />;
}
