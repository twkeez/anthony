import { AnthonyPageHeroTitle } from "@/components/agencypulse/anthony-brand";

/**
 * Shared title block for the signed-in workspace (home alerts vs. clients grid).
 */
export function AgencyWorkspaceHero({ tagline }: { tagline: string }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-zinc-500 text-xs font-black lowercase tracking-[0.25em]">workspace</p>
      <AnthonyPageHeroTitle productLine="agencypulse" />
      <p className="text-zinc-500 max-w-2xl text-sm font-bold lowercase leading-relaxed">{tagline}</p>
    </header>
  );
}
