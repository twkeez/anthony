-- PageSpeed Insights (Lighthouse) scores cached on current-month client_metrics at metrics sync.

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

-- Hub + workspace need the global performance threshold without the service role.
-- Drop first so a re-run does not fail the whole migration (which would roll back the new columns).
drop policy if exists "app_thresholds_select_anon_authenticated" on public.app_thresholds;

create policy "app_thresholds_select_anon_authenticated"
  on public.app_thresholds
  for select
  to anon, authenticated
  using (true);
