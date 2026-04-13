-- Google Ads Command Center: persisted rule trigger flags (evaluated at metrics sync).
alter table public.client_metrics
  add column if not exists google_ads_alerts jsonb;

comment on column public.client_metrics.google_ads_alerts is
  'Rule engine snapshot, e.g. { isFlatlined, hasDisapprovedAds, brokenTracking, spendDrop }.';
