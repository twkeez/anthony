-- Ensures Basecamp mapper + CSV import column exists (idempotent if a prior migration was skipped).
alter table public.clients
  add column if not exists basecamp_project_id text;

alter table public.clients
  add column if not exists basecamp_email text;
