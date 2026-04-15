-- Extra Basecamp identities treated as "internal" for message-board reply detection (contractors, partners, etc.).

create table public.communication_internal_parties (
  id uuid primary key default gen_random_uuid(),
  email text,
  basecamp_id text,
  display_name text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_internal_parties_one_identifier check (
    (email is not null and btrim(email) <> '')
    or (basecamp_id is not null and btrim(basecamp_id) <> '')
    or (display_name is not null and btrim(display_name) <> '')
  )
);

create unique index communication_internal_parties_email_active_lower_idx
  on public.communication_internal_parties (lower(btrim(email)))
  where is_active = true and email is not null and btrim(email) <> '';

create unique index communication_internal_parties_basecamp_id_active_idx
  on public.communication_internal_parties (btrim(basecamp_id))
  where is_active = true and basecamp_id is not null and btrim(basecamp_id) <> '';

create index communication_internal_parties_is_active_idx on public.communication_internal_parties (is_active);

alter table public.communication_internal_parties enable row level security;

create policy "Allow anonymous read communication_internal_parties"
  on public.communication_internal_parties
  for select
  to anon, authenticated
  using (true);

comment on table public.communication_internal_parties is 'Manual internal roster for Basecamp last_updater matching (in addition to staff + env lists).';
comment on column public.communication_internal_parties.display_name is 'Case-insensitive match to Basecamp last_updater.name when email/id are absent.';
