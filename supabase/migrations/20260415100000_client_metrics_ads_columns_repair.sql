-- Idempotent repair: some environments never applied 20260411160000 / 20260411180000,
-- which causes sync to fail with "column client_metrics.ads_impressions does not exist".
alter table public.client_metrics
  add column if not exists ads_impressions bigint,
  add column if not exists ads_ctr numeric,
  add column if not exists ads_average_cpc numeric,
  add column if not exists ads_search_impression_share numeric,
  add column if not exists ads_search_rank_lost_impression_share numeric,
  add column if not exists ads_search_budget_lost_impression_share numeric,
  add column if not exists ads_search_abs_top_impression_share numeric;
