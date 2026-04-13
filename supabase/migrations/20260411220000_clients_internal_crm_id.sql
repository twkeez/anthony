-- Internal CRM id for matching clients on bulk import (optional; unique when set).
alter table public.clients
  add column if not exists internal_crm_id text;

create unique index if not exists clients_internal_crm_id_key
  on public.clients (internal_crm_id)
  where internal_crm_id is not null and length(trim(internal_crm_id)) > 0;

comment on column public.clients.internal_crm_id is 'Optional CRM key; bulk import matches on this or case-insensitive client_name.';
