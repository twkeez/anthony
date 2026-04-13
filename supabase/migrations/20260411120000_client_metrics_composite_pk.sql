-- Allow one metrics row per client per calendar month (composite upsert target).
alter table public.client_metrics drop constraint if exists client_metrics_pkey;

alter table public.client_metrics
  add primary key (client_id, metric_month);
