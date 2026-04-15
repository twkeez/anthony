-- Per-thread (or whole "client waiting") snooze/dismiss for the communication command center.

create table public.communication_message_board_triage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  thread_key text not null,
  thread_updated_at text not null,
  action text not null check (action in ('dismiss', 'snooze')),
  snooze_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_message_board_triage_snooze_check check (
    action <> 'snooze' or snooze_until is not null
  )
);

create unique index communication_message_board_triage_client_thread_key_uidx
  on public.communication_message_board_triage (client_id, thread_key);

create index communication_message_board_triage_client_id_idx
  on public.communication_message_board_triage (client_id);

alter table public.communication_message_board_triage enable row level security;

create policy "Allow anonymous read communication_message_board_triage"
  on public.communication_message_board_triage
  for select
  to anon, authenticated
  using (true);

comment on table public.communication_message_board_triage is 'Snooze/dismiss rows on the communication board; hide until thread updated_at changes or snooze_until passes.';
comment on column public.communication_message_board_triage.thread_key is 'Stable id: url:<webUrl> or sub:<subject>\\0<updatedAt>, or __waiting_on_client__ for whole-card "no reply needed".';
