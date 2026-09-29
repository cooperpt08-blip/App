-- Shape Up: map of barbershops
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run).
-- Safe to run again: it skips anything that already exists.
--
-- Adds to each shop: a phone number, its map position (found from the address by
-- the owner's phone, no paid map service), and "listed" (show on the map; on by default,
-- the owner can switch it off).
--
-- Customers can see listed shops on a map and join one with a tap. Join codes stay
-- private: joining from the map only works for shops that chose to be listed.
-- ------------------------------------------------------------------

alter table public.shops
  add column if not exists phone text not null default '' check (char_length(phone) <= 30),
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists listed boolean not null default true;
grant update (phone, latitude, longitude, listed) on public.shops to authenticated;

-- Every listed shop that has a map position. Signed-in people only.
create or replace function public.shop_directory()
returns table (shop_id uuid, name text, address text, phone text, latitude double precision,
               longitude double precision, barbers bigint, is_my_shop boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.address, s.phone, s.latitude, s.longitude,
         (select count(*) from public.shop_members m where m.shop_id = s.id),
         s.id = public.my_customer_shop()
  from public.shops s
  where s.listed and s.latitude is not null and s.longitude is not null and auth.uid() is not null
  order by s.name;
$$;

-- A customer joins a listed shop straight from the map (no QR code needed).
create or replace function public.join_listed_shop(p_shop uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select s.name into v_name from public.shops s where s.id = p_shop and s.listed;
  if v_name is null then raise exception 'This shop isn’t taking new clients through the map. Ask them for their QR code.'; end if;
  update public.profiles p
    set shop_id = p_shop, shop_joined_at = now()
    where p.id = auth.uid() and p.kind = 'customer';
  if not found then raise exception 'Only customer accounts can join a shop'; end if;
  return v_name;
end;
$$;

revoke execute on function public.shop_directory, public.join_listed_shop from public, anon;
grant execute on function public.shop_directory, public.join_listed_shop to authenticated;
