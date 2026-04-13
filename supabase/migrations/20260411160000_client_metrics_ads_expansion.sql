-- Extra Google Ads aggregates for agency dashboard (impressions, CTR ratio, avg CPC).
alter table public.client_metrics
  add column if not exists ads_impressions bigint,
  add column if not exists ads_ctr numeric,
  add column if not exists ads_average_cpc numeric;

comment on column public.client_metrics.ads_impressions is 'Sum of metrics.impressions for the metric month.';
comment on column public.client_metrics.ads_ctr is 'Aggregate CTR as clicks/impressions (0–1).';
comment on column public.client_metrics.ads_average_cpc is 'Average CPC in account currency (spend/clicks).';
