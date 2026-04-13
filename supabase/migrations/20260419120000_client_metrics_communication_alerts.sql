alter table public.client_metrics
  add column if not exists communication_alerts jsonb;

comment on column public.client_metrics.communication_alerts is 'Basecamp overdue task summary per sync: counts, severity, task list.';
