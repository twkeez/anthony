-- Dev mapper and imports store Basecamp Classic project id on the client row.
alter table public.clients
  add column if not exists basecamp_project_id text;
