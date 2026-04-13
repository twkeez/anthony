import type { ActiveServices } from "@/types/database.types";

export const DEFAULT_ACTIVE_SERVICES: ActiveServices = {
  seo: false,
  ppc: false,
  social: false,
  orm: false,
};

export function normalizeActiveServices(raw: unknown): ActiveServices {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ACTIVE_SERVICES };
  const o = raw as Record<string, unknown>;
  return {
    seo: Boolean(o.seo),
    ppc: Boolean(o.ppc),
    social: Boolean(o.social),
    orm: Boolean(o.orm),
  };
}
