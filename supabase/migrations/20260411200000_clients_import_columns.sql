-- Bulk import / onboarding fields for clients.
alter table public.clients
  add column if not exists import_id text;

alter table public.clients
  add column if not exists monthly_ad_budget numeric;

alter table public.clients
  add column if not exists target_cpa numeric;

alter table public.clients
  add column if not exists search_console_url text;

alter table public.clients
  add column if not exists tag_manager_id text;

alter table public.clients
  add column if not exists gbp_location_id text;

alter table public.clients
  add column if not exists basecamp_project_id text;

alter table public.clients
  add column if not exists basecamp_email text;

alter table public.clients
  add column if not exists updated_at timestamptz not null default now();

-- Stable external key for CSV re-imports (optional per row). PostgreSQL allows multiple NULLs.
create unique index if not exists clients_import_id_key on public.clients (import_id);

comment on column public.clients.import_id is 'Optional stable ID from CSV; when set, bulk upsert matches on this column.';
