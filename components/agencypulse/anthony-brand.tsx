import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** 3D “A” mark + pulse — PNG in `/public/anthony-mark.png` (use `mix-blend-lighten` so black plate reads as transparent on dark UI). */
export const ANTHONY_MARK_SRC = "/anthony-mark.png";

const markGlow =
  "drop-shadow(0 0 10px rgba(244, 114, 182, 0.55)) drop-shadow(0 0 24px rgba(236, 72, 153, 0.28))";

type MarkProps = {
  width: number;
  height: number;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function AnthonyMark({ width, height, className, imageClassName, priority }: MarkProps) {
  return (
    <div
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-transparent", className)}
      style={{ filter: markGlow }}
    >
      <Image
        src={ANTHONY_MARK_SRC}
        alt="anthony"
        width={width}
        height={height}
        className={cn("object-contain mix-blend-lighten", imageClassName)}
        priority={priority}
      />
    </div>
  );
}

/** Compact header: icon + optional link to home. */
export function AnthonyLogoLink({
  href = "/",
  width,
  height,
  className,
  imageClassName,
  priority,
  onNavigate,
}: MarkProps & {
  href?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-fuchsia-500/40",
        className,
      )}
      aria-label="anthony — home"
      title="Home"
    >
      <AnthonyMark width={width} height={height} imageClassName={imageClassName} priority={priority} />
    </Link>
  );
}

const gradientA = "bg-gradient-to-br from-cyan-400 via-sky-400 to-blue-600 bg-clip-text text-transparent";

export function AnthonyWordmarkStack() {
  return (
    <div className="min-w-0 leading-tight">
      <p className="flex flex-wrap items-baseline gap-0 font-bold tracking-tight text-white">
        <span className={cn(gradientA, "text-xl lowercase")}>a</span>
        <span className="text-xl lowercase">nthony</span>
      </p>
      <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-white/50">agencypulse</p>
    </div>
  );
}

/** Sidebar: mark + wordmark + sub-brand (hidden when collapsed). */
export function AnthonySidebarBrand({
  compact,
  onNavigate,
}: {
  compact: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-lg py-0.5 pr-1 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-fuchsia-500/40",
        compact && "justify-center",
      )}
      aria-label="anthony — home"
    >
      <AnthonyMark
        width={compact ? 36 : 40}
        height={compact ? 36 : 40}
        imageClassName={compact ? "size-9" : "size-10"}
        priority
      />
      {!compact ? <AnthonyWordmarkStack /> : null}
    </Link>
  );
}

/** Page hero title: anthony + optional second line for product. */
export function AnthonyPageHeroTitle({
  productLine = "agencypulse",
}: {
  /** e.g. workspace context line */
  productLine?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="flex flex-wrap items-baseline gap-0 text-4xl font-black lowercase leading-none tracking-tight sm:text-5xl md:text-6xl">
        <span className={cn(gradientA)}>a</span>
        <span className="text-zinc-50">nthony</span>
      </h1>
      <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-white/50 sm:text-[11px]">
        {productLine}
      </p>
    </div>
  );
}
