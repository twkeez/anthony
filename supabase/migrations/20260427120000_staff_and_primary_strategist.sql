-- Agency staff directory (replaces env-based AGENCY_TEAM_* for communication classification).

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  basecamp_id text,
  basecamp_name_handle text,
  writing_style_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_email_unique unique (email)
);

create index staff_is_active_idx on public.staff (is_active);
create index staff_email_lower_idx on public.staff (lower(email));

alter table public.clients
  add column if not exists primary_strategist_id uuid references public.staff (id) on delete set null;

create index if not exists clients_primary_strategist_id_idx on public.clients (primary_strategist_id);

alter table public.staff enable row level security;

-- Dashboard reads (same pattern as clients).
create policy "Allow anonymous read staff"
  on public.staff
  for select
  to anon, authenticated
  using (true);

comment on table public.staff is 'Agency team for Basecamp author matching and AI voice emulation.';
comment on column public.staff.basecamp_name_handle is 'Display name as shown on Basecamp last_updater.name (case-insensitive match).';
comment on column public.staff.writing_style_notes is 'Voice / writing style for Gemini suggested replies and summaries.';
comment on column public.clients.primary_strategist_id is 'Assigned strategist; Gemini uses their writing_style_notes when set.';
