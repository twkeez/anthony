-- Persisted Strategy tab: written recommendation + optional roadmap milestone rows.
alter table public.clients
  add column if not exists strategy_workspace jsonb not null default '{}'::jsonb;

comment on column public.clients.strategy_workspace is
  'JSON: { "recommendation"?: string, "roadmap_items"?: [{ "id", "title", "due_date" }] }. Edited from client Strategy / Roadmap tabs.';
