"use client";

import {
  Braces,
  CheckSquare,
  FileUp,
  FolderKanban,
  Gauge,
  Globe2,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageCircle,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";

import { AnthonySidebarBrand } from "@/components/agencypulse/anthony-brand";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLink =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

const navActive =
  "bg-gradient-to-r from-blue-600/15 via-violet-600/15 to-fuchsia-600/10 text-white before:absolute before:left-0 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gradient-to-b before:from-sky-400 before:to-fuchsia-500 before:content-['']";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (path: string) => boolean;
};

const items: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: LayoutDashboard,
    match: (p) => p === "/" || p === "",
  },
  {
    href: "/dashboard",
    label: "Clients",
    icon: Users,
    match: (p) =>
      p === "/dashboard" ||
      (p.startsWith("/dashboard/clients/") && !p.startsWith("/dashboard/clients/manage")),
  },
  {
    href: "/dashboard/ads",
    label: "Ads",
    icon: Megaphone,
    match: (p) => p.startsWith("/dashboard/ads"),
  },
  {
    href: "/dashboard/sitemap",
    label: "Sitemap",
    icon: Globe2,
    match: (p) => p.startsWith("/dashboard/sitemap"),
  },
  {
    href: "/dashboard/ga4",
    label: "GA4",
    icon: LineChart,
    match: (p) => p === "/dashboard/ga4" || p.startsWith("/dashboard/ga4/"),
  },
  {
    href: "/dashboard/lighthouse",
    label: "Lighthouse",
    icon: Gauge,
    match: (p) => p.startsWith("/dashboard/lighthouse"),
  },
  {
    href: "/dashboard/communication",
    label: "Communication",
    icon: MessageCircle,
    match: (p) => p.startsWith("/dashboard/communication"),
  },
  {
    href: "/dashboard/dev/ga4-mapper",
    label: "GA4 mapper",
    icon: Braces,
    match: (p) => p.startsWith("/dashboard/dev/ga4-mapper"),
  },
  {
    href: "/dashboard/dev/basecamp-mapper",
    label: "Basecamp mapper",
    icon: FolderKanban,
    match: (p) => p.startsWith("/dashboard/dev/basecamp-mapper"),
  },
  {
    href: "/dashboard/clients/manage",
    label: "Import",
    icon: FileUp,
    match: (p) => p.startsWith("/dashboard/clients/manage"),
  },
  {
    href: "/dashboard/tasks",
    label: "Tasks",
    icon: CheckSquare,
    match: (p) => p.startsWith("/dashboard/tasks"),
  },
];

const COLLAPSE_KEY = "agencypulse-sidebar-collapsed";

type Props = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
};

export function DashboardSidebar({ mobileOpen, onMobileOpenChange, onOpenSettings }: Props) {
  const pathname = usePathname();
  /** Always `false` on SSR and on the first client render so markup matches the server; then sync from localStorage. */
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") {
        /* eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync */
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const compact = collapsed;

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const linkBody = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.match(pathname);
    return (
      <Link
        href={item.href}
        onClick={() => onMobileOpenChange(false)}
        title={compact ? item.label : undefined}
        className={cn(navLink, active && navActive, compact && "justify-center px-2")}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0",
            active ? "text-white" : "text-zinc-500 group-hover:text-zinc-200",
          )}
        />
        {!compact ? <span>{item.label}</span> : null}
      </Link>
    );
  };

  const sidebarInner = (
    <>
      <div className={cn("flex flex-col gap-1", compact ? "px-2" : "px-3")}>
        <div className={cn("mb-6 flex items-center gap-2 pt-1", compact && "justify-center")}>
          <AnthonySidebarBrand
            compact={compact}
            onNavigate={() => onMobileOpenChange(false)}
          />
        </div>

        <nav className="flex flex-col gap-0.5">
          {items.map((item) => (
            <div key={item.href}>{linkBody(item)}</div>
          ))}
          <button
            type="button"
            title={compact ? "Settings" : undefined}
            onClick={() => {
              onOpenSettings();
              onMobileOpenChange(false);
            }}
            className={cn(
              "group",
              navLink,
              "w-full border-0 bg-transparent text-left",
              compact && "justify-center px-2",
            )}
          >
            <Settings className="size-[18px] shrink-0 text-zinc-500 group-hover:text-zinc-200" />
            {!compact ? <span>Settings</span> : null}
          </button>
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-zinc-800 pt-4">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg bg-zinc-900/50 px-2 py-2",
            compact && "justify-center px-0",
          )}
        >
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-xs font-semibold text-zinc-100 ring-1 ring-zinc-700"
            aria-hidden
          >
            AP
          </div>
          {!compact ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">Agency user</p>
              <p className="text-muted-foreground truncate text-xs text-zinc-500">you@agency.com</p>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleCollapse}
          className={cn(
            "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
            compact ? "justify-center px-0" : "justify-start gap-2",
          )}
        >
          {compact ? (
            <PanelLeft className="size-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" />
              <span>Collapse sidebar</span>
            </>
          )}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-indigo-500/25 bg-gradient-to-b from-zinc-950 via-indigo-950/30 to-zinc-950 py-6 shadow-[4px_0_24px_-8px_rgba(99,102,241,0.35)] transition-[transform,width] duration-200 md:static md:z-0 md:translate-x-0",
          compact ? "md:w-[72px]" : "md:w-64",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "px-2" : "px-3")}>{sidebarInner}</div>
      </aside>
    </>
  );
}
