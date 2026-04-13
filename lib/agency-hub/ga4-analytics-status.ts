/** Flags written to `client_metrics.ga4_alerts` at sync time. */
export type Ga4AlertsState = {
  isTrafficCliff: boolean;
  isConversionGhost: boolean;
};

export type Ga4RulesConfig = {
  rule_traffic_cliff_enabled: boolean;
  rule_conversion_ghost_enabled: boolean;
};

export const EMPTY_GA4_ALERTS: Ga4AlertsState = {
  isTrafficCliff: false,
  isConversionGhost: false,
};

export function parseGa4AlertsJson(raw: unknown): Ga4AlertsState | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    isTrafficCliff: Boolean(o.isTrafficCliff),
    isConversionGhost: Boolean(o.isConversionGhost),
  };
}

export type Ga4AccountHealth = "red" | "yellow" | "green" | "none";

/**
 * @param ga4Metrics — optional pulled totals; when the property is configured but all totals are still null,
 *   we surface **yellow** (needs attention) instead of falsely showing **green** with empty cells.
 */
export function calculateGa4AccountStatus(
  client: { ga4_property_id: string | null | undefined },
  alerts: Ga4AlertsState | null | undefined,
  rules: Ga4RulesConfig,
  ga4Metrics?: {
    ga4_sessions: number | null;
    ga4_key_events: number | null;
    ga4_engagement_rate: number | null;
  } | null,
): Ga4AccountHealth {
  if (!client.ga4_property_id?.trim()) {
    return "none";
  }
  const a = alerts ?? EMPTY_GA4_ALERTS;
  if (rules.rule_traffic_cliff_enabled && a.isTrafficCliff) return "red";
  if (rules.rule_conversion_ghost_enabled && a.isConversionGhost) return "yellow";

  const m = ga4Metrics;
  if (m) {
    const hasAny =
      (m.ga4_sessions != null && Number.isFinite(m.ga4_sessions)) ||
      (m.ga4_key_events != null && Number.isFinite(m.ga4_key_events)) ||
      (m.ga4_engagement_rate != null && Number.isFinite(m.ga4_engagement_rate));
    if (!hasAny) return "yellow";
  }

  return "green";
}

export function ga4HealthSortRank(s: Ga4AccountHealth): number {
  if (s === "red") return 0;
  if (s === "yellow") return 1;
  if (s === "green") return 2;
  return 3;
}

export type Ga4AlertBadge = { key: keyof Ga4AlertsState; label: string; tone: "red" | "amber" };

export function activeGa4AlertBadges(
  alerts: Ga4AlertsState | null | undefined,
  rules: Ga4RulesConfig,
): Ga4AlertBadge[] {
  const a = alerts ?? EMPTY_GA4_ALERTS;
  const out: Ga4AlertBadge[] = [];
  if (rules.rule_traffic_cliff_enabled && a.isTrafficCliff) {
    out.push({ key: "isTrafficCliff", label: "Traffic Cliff", tone: "red" });
  }
  if (rules.rule_conversion_ghost_enabled && a.isConversionGhost) {
    out.push({ key: "isConversionGhost", label: "Conversion Ghost", tone: "amber" });
  }
  return out;
}
