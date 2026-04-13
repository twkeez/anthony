-- AgencyPulse: clients (columns aligned with Master_Clients_Import.csv)

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  team_member text,
  monthly_hours numeric,
  service_tier text,
  services text,
  website text,
  location text,
  primary_contact text,
  client_vibe_notes text,
  account_group text,
  created_at timestamptz not null default now()
);

create index clients_business_name_idx on public.clients (business_name);
create index clients_account_group_idx on public.clients (account_group);

alter table public.clients enable row level security;

create policy "Allow anonymous read clients"
  on public.clients
  for select
  to anon, authenticated
  using (true);

-- Global alert thresholds (edited via Settings in the app; server uses service role)
create table public.app_thresholds (
  id text primary key default 'global',
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_thresholds (id, rules)
values (
  'global',
  jsonb_build_object(
    'flag_ads_spend_no_conversions', true,
    'flag_zero_conversions_any_spend', true,
    'min_performance_score', 50
  )
)
on conflict (id) do nothing;

alter table public.app_thresholds enable row level security;

-- Master MCC / agency Google OAuth tokens (service role only — no anon policies)
create table public.google_agency_connection (
  id smallint primary key default 1,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  scopes text,
  connected_email text,
  updated_at timestamptz not null default now(),
  constraint google_agency_connection_single_row check (id = 1)
);

alter table public.google_agency_connection enable row level security;
