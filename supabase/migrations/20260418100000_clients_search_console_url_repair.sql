-- Ensure GSC property URL column exists (PostgREST error if missing from DB / schema cache).
alter table public.clients
  add column if not exists search_console_url text;

comment on column public.clients.search_console_url is
  'Search Console property URL (https://…/ or sc-domain:…). Used for sitemaps.list during metrics sync.';
