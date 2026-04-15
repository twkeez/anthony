-- Google Business Profile reviews (synced from My Business API v4)

create table if not exists public.gbp_reviews (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  /** Google `reviewId` field (unique per location; we enforce uniqueness per row id + client). */
  review_id text not null,
  /** Full resource name `accounts/.../locations/.../reviews/...` for reply API. */
  review_resource_name text not null,
  reviewer_name text not null default '',
  star_rating integer not null check (star_rating >= 1 and star_rating <= 5),
  comment text,
  reply_text text,
  is_replied boolean not null default false,
  review_timestamp timestamptz,
  last_sync_at timestamptz not null default now (),
  unique (review_resource_name)
);

create index if not exists gbp_reviews_client_id_idx on public.gbp_reviews (client_id);
create index if not exists gbp_reviews_client_rating_replied_idx
  on public.gbp_reviews (client_id, star_rating, is_replied);

comment on table public.gbp_reviews is 'Google Business Profile reviews; sync via scripts/sync-gbp-reviews.ts.';

alter table public.gbp_reviews enable row level security;

create policy "gbp_reviews_select"
  on public.gbp_reviews for select to anon, authenticated using (true);

create policy "gbp_reviews_insert"
  on public.gbp_reviews for insert to anon, authenticated with check (true);

create policy "gbp_reviews_update"
  on public.gbp_reviews for update to anon, authenticated using (true) with check (true);

create policy "gbp_reviews_delete"
  on public.gbp_reviews for delete to anon, authenticated using (true);
