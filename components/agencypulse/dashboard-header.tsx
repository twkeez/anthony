"use client";

import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { AnthonyLogoLink } from "@/components/agencypulse/anthony-brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardBreadcrumb } from "@/lib/context/dashboard-breadcrumb";
import { cn } from "@/lib/utils";


type Crumb = { label: string; href: string | null };

function useBreadcrumbs(): Crumb[] {
  const pathname = usePathname();
  const { clientSegmentLabel } = useDashboardBreadcrumb();

  return useMemo(() => {
    if (pathname === "/" || pathname === "") {
      return [{ label: "Home", href: null }];
    }

    const out: Crumb[] = [{ label: "Home", href: "/" }];

    if (pathname === "/dashboard") {
      out.push({ label: "Clients", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/clients/manage")) {
      out.push({ label: "Import", href: "/dashboard/clients/manage" });
      return out;
    }

    if (pathname.startsWith("/dashboard/clients/")) {
      out.push({ label: "Clients", href: "/dashboard" });
      out.push({
        label: clientSegmentLabel ?? "Client",
        href: null,
      });
      return out;
    }

    if (pathname.startsWith("/dashboard/ads")) {
      out.push({ label: "Ads", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/sitemap")) {
      out.push({ label: "Sitemap", href: null });
      return out;
    }

    if (pathname === "/dashboard/ga4" || pathname.startsWith("/dashboard/ga4/")) {
      out.push({ label: "GA4", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/lighthouse")) {
      out.push({ label: "Lighthouse", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/communication")) {
      out.push({ label: "Communication", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/dev/ga4-mapper")) {
      out.push({ label: "GA4 mapper", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/dev/basecamp-mapper")) {
      out.push({ label: "Basecamp mapper", href: null });
      return out;
    }

    if (pathname.startsWith("/dashboard/tasks")) {
      out.push({ label: "Tasks", href: null });
      return out;
    }

    out.push({ label: "Page", href: null });
    return out;
  }, [pathname, clientSegmentLabel]);
}

type Props = {
  onOpenMobileNav: () => void;
  onOpenSettings: () => void;
};

export function DashboardHeader({ onOpenMobileNav, onOpenSettings }: Props) {
  const router = useRouter();
  const crumbs = useBreadcrumbs();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as {
        message?: string;
        ok?: boolean;
        succeeded?: number;
        total?: number;
      };
      setSyncMsg(data.message ?? (res.ok ? "Sync finished." : "Sync failed."));
      router.refresh();
    } catch {
      setSyncMsg("Network error while calling sync.");
    } finally {
      setSyncing(false);
    }
  }

  const onSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = search.trim();
      router.push(q ? `/dashboard?q=${encodeURIComponent(q)}` : "/dashboard");
    },
    [router, search],
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/80 px-3 backdrop-blur-md sm:gap-4 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden"
          aria-label="Open menu"
          onClick={onOpenMobileNav}
        >
          <Menu className="size-5" />
        </Button>

        <AnthonyLogoLink href="/" width={32} height={32} className="shrink-0" imageClassName="size-8" />

        <nav className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="text-zinc-600 size-3.5 shrink-0" aria-hidden /> : null}
              {c.href ? (
                <Link
                  href={c.href}
                  className="text-zinc-500 hover:text-zinc-100 truncate transition-colors"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="text-zinc-100 truncate font-medium">{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3">
          <form onSubmit={onSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Quick search…"
              className="border-zinc-700 bg-zinc-900/80 h-9 w-44 rounded-full border pl-9 text-sm text-zinc-100 placeholder:text-zinc-500 lg:w-56"
            />
          </form>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={runSync}
            className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
          >
            {syncing ? "Syncing…" : "Sync all"}
          </Button>
          <a
            href="/api/integrations/google"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white",
            )}
          >
            Connect Google
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
          >
            Settings
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2 sm:hidden">
        <form onSubmit={onSearchSubmit} className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Quick search…"
            className="border-zinc-700 bg-zinc-900/80 h-9 w-full rounded-full border pl-9 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
        </form>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={runSync}
          className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
        >
          {syncing ? "…" : "Sync all"}
        </Button>
        <a
          href="/api/integrations/google"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white",
          )}
        >
          Connect Google
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
        >
          Settings
        </Button>
      </div>

      {syncMsg ? (
        <p className="text-zinc-500 border-b border-zinc-800 bg-zinc-950 px-4 py-1.5 text-xs sm:px-6">{syncMsg}</p>
      ) : null}
    </>
  );
}
