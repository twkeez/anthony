-- Client strategy goals (metrics targets + intent + Basecamp keyword hooks)

create type public.client_goal_type as enum (
  'Acquisition',
  'Efficiency',
  'Awareness',
  'Retention'
);

create type public.client_goal_status as enum (
  'active',
  'completed'
);

create table if not exists public.client_goals (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  goal_type public.client_goal_type not null,
  target_value numeric not null,
  metric_target_column text not null,
  intent_statement text not null,
  evidence_keywords text[] not null default '{}',
  status public.client_goal_status not null default 'active',
  ai_analysis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_goals_client_id_idx on public.client_goals (client_id);
create index if not exists client_goals_client_status_idx on public.client_goals (client_id, status);

comment on table public.client_goals is 'Per-client strategy goals; metric_target_column maps to client_metrics columns (app whitelist).';

alter table public.client_goals enable row level security;

create policy "client_goals_select"
  on public.client_goals for select to anon, authenticated using (true);

create policy "client_goals_insert"
  on public.client_goals for insert to anon, authenticated with check (true);

create policy "client_goals_update"
  on public.client_goals for update to anon, authenticated using (true) with check (true);

create policy "client_goals_delete"
  on public.client_goals for delete to anon, authenticated using (true);
