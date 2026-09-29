-- Shape Up: AI haircut recommendations
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run).
-- Safe to run again: it skips anything that already exists.
--
-- Adds:
--   * monthly limits: no shop = 1 free recommendation ever; linked to a shop = 5 per month;
--     admins (you) have no limit, for testing
--   * trend_cache: the AI's web research on current haircut trends, reused for 7 days
--     so each customer doesn't pay for a new search
-- ------------------------------------------------------------------

create table if not exists public.trend_cache (
  key text primary key,          -- e.g. "modern and trendy|wavy|25-34"
  summary text not null,
  searches integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.trend_cache enable row level security;
revoke all on public.trend_cache from anon, authenticated;
-- No rules = only the server can read or write it.

-- How many recommendations someone has used and has left. Used by the server.
create or replace function public.recommendation_allowance_for(p_user uuid)
returns table (used integer, allowed integer, remaining integer, linked boolean, unlimited boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.shop_id is not null as linked,
           exists (select 1 from public.app_admins a where a.user_id = p.id) as unlimited
    from public.profiles p where p.id = p_user
  ),
  counts as (
    select
      (select count(*) from public.recommendations r where r.customer_id = p_user)::int as ever,
      (select count(*) from public.recommendations r
        where r.customer_id = p_user and r.created_at >= date_trunc('month', now()))::int as this_month
  )
  select
    case when me.linked then counts.this_month else counts.ever end,
    case when me.linked then 5 else 1 end,
    case when me.unlimited then 999
         else greatest(0, (case when me.linked then 5 else 1 end) - (case when me.linked then counts.this_month else counts.ever end)) end,
    me.linked,
    me.unlimited
  from me cross join counts;
$$;
revoke execute on function public.recommendation_allowance_for from public, anon, authenticated;

-- The same, for the signed-in person (shown in the app).
create or replace function public.my_recommendation_allowance()
returns table (used integer, allowed integer, remaining integer, linked boolean, unlimited boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.recommendation_allowance_for(auth.uid());
$$;
revoke execute on function public.my_recommendation_allowance from public, anon;
grant execute on function public.my_recommendation_allowance to authenticated;
