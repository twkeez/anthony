-- Search Console sitemap snapshot (updated during client metrics sync)
alter table public.client_metrics
  add column if not exists sitemap_url text,
  add column if not exists sitemap_status text,
  add column if not exists sitemap_last_downloaded timestamptz;

comment on column public.client_metrics.sitemap_url is 'Primary sitemap path from Search Console sitemaps.list.';
comment on column public.client_metrics.sitemap_status is 'Mapped GSC state: Success, Pending, Error, Submitted.';
comment on column public.client_metrics.sitemap_last_downloaded is 'Last time Google downloaded the sitemap (API lastDownloaded).';
