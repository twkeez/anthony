alter table public.client_metrics
  add column if not exists ga4_engagement_rate numeric;

alter table public.client_metrics
  add column if not exists ga4_alerts jsonb;

comment on column public.client_metrics.ga4_engagement_rate is 'GA4 engagementRate (0–1) for trailing ~30 days at sync.';
comment on column public.client_metrics.ga4_alerts is 'GA4 rule flags from Data API at sync: traffic cliff, conversion ghost.';
