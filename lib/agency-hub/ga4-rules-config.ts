import type { Ga4RulesConfig } from "@/lib/agency-hub/ga4-analytics-status";

export type { Ga4RulesConfig };

export const GA4_RULES_STORAGE_KEY = "agencypulse-ga4-rules";

export const DEFAULT_GA4_RULES_CONFIG: Ga4RulesConfig = {
  rule_traffic_cliff_enabled: true,
  rule_conversion_ghost_enabled: true,
};

export function loadGa4RulesConfig(): Ga4RulesConfig {
  if (typeof window === "undefined") return { ...DEFAULT_GA4_RULES_CONFIG };
  try {
    const raw = localStorage.getItem(GA4_RULES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GA4_RULES_CONFIG };
    const parsed = JSON.parse(raw) as Partial<Ga4RulesConfig>;
    return {
      ...DEFAULT_GA4_RULES_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_GA4_RULES_CONFIG };
  }
}

export function saveGa4RulesConfig(config: Ga4RulesConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GA4_RULES_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
