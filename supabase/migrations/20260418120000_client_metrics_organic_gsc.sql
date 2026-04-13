-- Search Console Search Analytics (last 30 days snapshot at sync time)
alter table public.client_metrics
  add column if not exists organic_clicks integer,
  add column if not exists organic_impressions integer,
  add column if not exists top_organic_queries jsonb;

comment on column public.client_metrics.organic_clicks is 'GSC web search clicks, trailing 30 days, from searchanalytics.query totals.';
comment on column public.client_metrics.organic_impressions is 'GSC web search impressions, trailing 30 days.';
comment on column public.client_metrics.top_organic_queries is 'JSON array of { query, clicks, impressions? } top 5 queries by clicks.';
