create type public.report_status as enum ('draft', 'published');

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  blocks jsonb not null default '[]'::jsonb,
  strategist_notes text,
  public_id uuid not null default gen_random_uuid (),
  status public.report_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_id)
);

create index if not exists reports_client_id_idx on public.reports (client_id);
create index if not exists reports_public_id_idx on public.reports (public_id);

alter table public.reports enable row level security;

create policy "reports_select"
  on public.reports for select to anon, authenticated using (true);

create policy "reports_insert"
  on public.reports for insert to anon, authenticated with check (true);

create policy "reports_update"
  on public.reports for update to anon, authenticated using (true) with check (true);

create policy "reports_delete"
  on public.reports for delete to anon, authenticated using (true);
