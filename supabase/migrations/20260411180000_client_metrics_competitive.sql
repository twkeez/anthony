-- Search competitive / visibility metrics (ratios stored as 0–1).
alter table public.client_metrics
  add column if not exists ads_search_impression_share numeric,
  add column if not exists ads_search_rank_lost_impression_share numeric,
  add column if not exists ads_search_budget_lost_impression_share numeric,
  add column if not exists ads_search_abs_top_impression_share numeric;

comment on column public.client_metrics.ads_search_impression_share is 'Search impression share (0–1), rolled up from daily rows.';
comment on column public.client_metrics.ads_search_rank_lost_impression_share is 'Search rank lost IS share (0–1).';
comment on column public.client_metrics.ads_search_budget_lost_impression_share is 'Search budget lost IS share (0–1).';
comment on column public.client_metrics.ads_search_abs_top_impression_share is 'Search absolute top impression share (0–1); API search_absolute_top_impression_share.';
