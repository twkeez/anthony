-- Idempotent repair if `gbp_location_id` was never applied (e.g. skipped migration).
alter table public.clients
  add column if not exists gbp_location_id text;
