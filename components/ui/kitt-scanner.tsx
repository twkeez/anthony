"use client";

import { cn } from "@/lib/utils";

/**
 * Knight Rider–style horizontal scanner: 15% width glow segment sweeps the bar.
 * When `slow`, switches to pulsing amber for long-running syncs.
 */
export function KittScanner({ active, slow }: { active: boolean; slow: boolean }) {
  if (!active) return null;

  return (
    <div
      className="w-full border-b border-zinc-800/60 bg-zinc-950/50 px-4 pb-2 pt-1 sm:px-8"
      role="status"
      aria-live="polite"
      aria-label={slow ? "Sync slow response" : "Sync in progress"}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-sm bg-red-950/20">
        <div className="kitt-scan-animate absolute top-0 h-full w-[15%]">
          <div
            className={cn(
              "h-full w-full rounded-[1px]",
              slow
                ? "animate-pulse bg-[#f59e0b] shadow-[0_0_15px_#f59e0b]"
                : "bg-[#ff0000] shadow-[0_0_15px_#ff0000]",
            )}
          />
        </div>
      </div>
      <p className="mt-1.5 text-center font-mono text-[10px] leading-tight tracking-tight text-red-500">
        ANTHONY_SCANNING_SEQUENCES...
      </p>
    </div>
  );
}
