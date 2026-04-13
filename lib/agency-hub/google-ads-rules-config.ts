/**
 * Global rule toggles for the Google Ads Command Center.
 * UI can override via localStorage (`STORAGE_KEY`); merge with {@link loadGoogleAdsRulesConfig}.
 */
import type { GoogleAdsRulesConfig } from "@/lib/agency-hub/google-ads-account-status";

export type { GoogleAdsRulesConfig };

export const GOOGLE_ADS_RULES_STORAGE_KEY = "agencypulse-google-ads-rules";

export const DEFAULT_GOOGLE_ADS_RULES_CONFIG: GoogleAdsRulesConfig = {
  rule_flatline_enabled: true,
  rule_policy_enabled: true,
  rule_broken_tracking_enabled: true,
  rule_spend_drop_enabled: true,
};

export function loadGoogleAdsRulesConfig(): GoogleAdsRulesConfig {
  if (typeof window === "undefined") return { ...DEFAULT_GOOGLE_ADS_RULES_CONFIG };
  try {
    const raw = localStorage.getItem(GOOGLE_ADS_RULES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GOOGLE_ADS_RULES_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GoogleAdsRulesConfig>;
    return {
      ...DEFAULT_GOOGLE_ADS_RULES_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_GOOGLE_ADS_RULES_CONFIG };
  }
}

export function saveGoogleAdsRulesConfig(config: GoogleAdsRulesConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GOOGLE_ADS_RULES_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
