-- Repair / idempotent: ensures Lighthouse columns exist if an older migration was skipped or failed
-- before the policy step (Postgres rolls back the whole migration file on any error).

alter table public.client_metrics
  add column if not exists lighthouse_performance numeric,
  add column if not exists lighthouse_accessibility numeric,
  add column if not exists lighthouse_seo numeric,
  add column if not exists lighthouse_best_practices numeric,
  add column if not exists lighthouse_audited_url text,
  add column if not exists lighthouse_error text;

comment on column public.client_metrics.lighthouse_performance is 'Lighthouse performance category score 0–100 from PageSpeed Insights v5 API (mobile).';
comment on column public.client_metrics.lighthouse_accessibility is 'Lighthouse accessibility score 0–100.';
comment on column public.client_metrics.lighthouse_seo is 'Lighthouse SEO score 0–100.';
comment on column public.client_metrics.lighthouse_best_practices is 'Lighthouse best-practices score 0–100.';
comment on column public.client_metrics.lighthouse_audited_url is 'Final URL passed to runPagespeed (after https normalization).';
comment on column public.client_metrics.lighthouse_error is 'Short PSI/API error when the audit did not return scores.';

drop policy if exists "app_thresholds_select_anon_authenticated" on public.app_thresholds;

create policy "app_thresholds_select_anon_authenticated"
  on public.app_thresholds
  for select
  to anon, authenticated
  using (true);
