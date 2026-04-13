-- Client extensions: primary email domain, structured active services, integration IDs
alter table public.clients
  add column if not exists email_domain text;

alter table public.clients
  add column if not exists active_services jsonb not null default jsonb_build_object(
    'seo', false,
    'ppc', false,
    'social', false,
    'orm', false
  );

alter table public.clients
  add column if not exists google_ads_customer_id text;

alter table public.clients
  add column if not exists ga4_property_id text;

-- Tasks per client
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  assigned_to text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_client_id_idx on public.tasks (client_id);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);

alter table public.tasks enable row level security;

create policy "tasks_select"
  on public.tasks for select to anon, authenticated using (true);

create policy "tasks_insert"
  on public.tasks for insert to anon, authenticated with check (true);

create policy "tasks_update"
  on public.tasks for update to anon, authenticated using (true) with check (true);

create policy "tasks_delete"
  on public.tasks for delete to anon, authenticated using (true);

-- Cached Google metrics (last successful sync per client)
create table if not exists public.client_metrics (
  client_id uuid primary key references public.clients (id) on delete cascade,
  metric_month date not null,
  ads_spend numeric,
  ads_conversions numeric,
  ads_clicks integer,
  ga4_sessions integer,
  ga4_key_events integer,
  ai_summary text,
  last_synced_at timestamptz,
  sync_error text,
  updated_at timestamptz not null default now()
);

alter table public.client_metrics enable row level security;

create policy "client_metrics_select"
  on public.client_metrics for select to anon, authenticated using (true);

-- Writes use the Supabase service role in API routes (bypasses RLS).
