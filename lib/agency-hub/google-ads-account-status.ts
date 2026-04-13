import type { ClientRow } from "@/types/client";

/** Flags written to `client_metrics.google_ads_alerts` at sync time (extend with Ads API queries later). */
export type GoogleAdsAlertsState = {
  isFlatlined: boolean;
  hasDisapprovedAds: boolean;
  brokenTracking: boolean;
  spendDrop: boolean;
};

export type GoogleAdsRulesConfig = {
  rule_flatline_enabled: boolean;
  rule_policy_enabled: boolean;
  rule_broken_tracking_enabled: boolean;
  rule_spend_drop_enabled: boolean;
};

export const EMPTY_GOOGLE_ADS_ALERTS: GoogleAdsAlertsState = {
  isFlatlined: false,
  hasDisapprovedAds: false,
  brokenTracking: false,
  spendDrop: false,
};

export function parseGoogleAdsAlertsJson(raw: unknown): GoogleAdsAlertsState | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    isFlatlined: Boolean(o.isFlatlined),
    hasDisapprovedAds: Boolean(o.hasDisapprovedAds),
    brokenTracking: Boolean(o.brokenTracking),
    spendDrop: Boolean(o.spendDrop),
  };
}

/**
 * Legacy month-to-date heuristic (superseded by GAQL in sync). Kept for callers/tests that only have MTD totals.
 */
export function computeGoogleAdsAlertsFromMonthSync(params: {
  ads_clicks: number | null;
  ads_conversions: number | null;
}): GoogleAdsAlertsState {
  const clicks = params.ads_clicks ?? 0;
  const conv = params.ads_conversions ?? 0;
  return {
    isFlatlined: false,
    hasDisapprovedAds: false,
    brokenTracking: clicks > 50 && conv === 0,
    spendDrop: false,
  };
}

export type AdsAccountHealth = "red" | "yellow" | "green" | "none";

/**
 * Traffic-light status from persisted alert flags + which rules are enabled.
 * Flatline (red) wins over yellow rules.
 */
export function calculateAdAccountStatus(
  client: Pick<ClientRow, "google_ads_customer_id">,
  alerts: GoogleAdsAlertsState | null | undefined,
  rulesConfig: GoogleAdsRulesConfig,
): AdsAccountHealth {
  if (!client.google_ads_customer_id?.trim()) {
    return "none";
  }
  const a = alerts ?? EMPTY_GOOGLE_ADS_ALERTS;
  if (rulesConfig.rule_flatline_enabled && a.isFlatlined) return "red";
  if (rulesConfig.rule_policy_enabled && a.hasDisapprovedAds) return "yellow";
  if (rulesConfig.rule_broken_tracking_enabled && a.brokenTracking) return "yellow";
  if (rulesConfig.rule_spend_drop_enabled && a.spendDrop) return "yellow";
  return "green";
}

export function adsHealthSortRank(s: AdsAccountHealth): number {
  if (s === "red") return 0;
  if (s === "yellow") return 1;
  if (s === "green") return 2;
  return 3;
}

export type AlertBadge = { key: keyof GoogleAdsAlertsState; label: string; tone: "red" | "amber" };

export function activeAlertBadges(
  alerts: GoogleAdsAlertsState | null | undefined,
  rules: GoogleAdsRulesConfig,
): AlertBadge[] {
  const a = alerts ?? EMPTY_GOOGLE_ADS_ALERTS;
  const out: AlertBadge[] = [];
  if (rules.rule_flatline_enabled && a.isFlatlined) {
    out.push({ key: "isFlatlined", label: "0 Impressions", tone: "red" });
  }
  if (rules.rule_policy_enabled && a.hasDisapprovedAds) {
    out.push({ key: "hasDisapprovedAds", label: "Disapproved Ads", tone: "amber" });
  }
  if (rules.rule_broken_tracking_enabled && a.brokenTracking) {
    out.push({ key: "brokenTracking", label: "0 Conv.", tone: "amber" });
  }
  if (rules.rule_spend_drop_enabled && a.spendDrop) {
    out.push({ key: "spendDrop", label: "Spend Drop", tone: "amber" });
  }
  return out;
}
