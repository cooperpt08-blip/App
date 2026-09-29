-- Shape Up: hand a shop to a new owner
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run).
-- Safe to run again: it skips anything that already exists.
--
-- Before an owner can delete their account, they choose who takes over the shop:
--   * one of their barbers (takes over immediately), or
--   * anyone by email (takes over when they sign in with that email; until then the
--     shop keeps running and barbers keep working, it just has no owner), or
--   * nobody, because the shop is closing (only then is the shop deleted).
-- ------------------------------------------------------------------

-- A shop can briefly have no owner while a new one accepts. Deleting the owner's
-- account no longer deletes (or blocks) the shop.
alter table public.shops alter column owner_id drop not null;
alter table public.shops drop constraint if exists shops_owner_id_fkey;
alter table public.shops add constraint shops_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

-- One pending "take over this shop" invite per shop.
create table if not exists public.shop_owner_invites (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shop_owner_invites enable row level security;
revoke all on public.shop_owner_invites from anon, authenticated;
grant select, delete on public.shop_owner_invites to authenticated;
drop policy if exists "owner invites: shop owner reads" on public.shop_owner_invites;
create policy "owner invites: shop owner reads" on public.shop_owner_invites for select to authenticated
  using (public.is_shop_owner(shop_id));
drop policy if exists "owner invites: shop owner cancels" on public.shop_owner_invites;
create policy "owner invites: shop owner cancels" on public.shop_owner_invites for delete to authenticated
  using (public.is_shop_owner(shop_id));

-- Owner hands the shop to one of their barbers, right now. The old owner stays on as a barber.
create or replace function public.transfer_shop_to_member(p_shop uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_shop_owner(p_shop) then raise exception 'Only the shop owner can hand over the shop'; end if;
  if p_new_owner = auth.uid() then raise exception 'You already own this shop'; end if;
  if not exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = p_new_owner) then
    raise exception 'That person isn’t on your team';
  end if;
  update public.shop_members set role = 'barber' where shop_id = p_shop and user_id = auth.uid();
  update public.shop_members set role = 'owner' where shop_id = p_shop and user_id = p_new_owner;
  update public.shops set owner_id = p_new_owner where id = p_shop;
  delete from public.shop_owner_invites where shop_id = p_shop;
end;
$$;

-- Owner invites someone by email to take over. Replaces any earlier invite for the shop.
create or replace function public.invite_shop_owner(p_shop uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.is_shop_owner(p_shop) then raise exception 'Only the shop owner can hand over the shop'; end if;
  if v_email = lower(auth.jwt() ->> 'email') then raise exception 'That’s your own email. Enter the new owner’s email.'; end if;
  insert into public.shop_owner_invites (shop_id, email, invited_by) values (p_shop, v_email, auth.uid())
    on conflict (shop_id) do update set email = excluded.email, invited_by = excluded.invited_by, created_at = now();
end;
$$;

-- Shops waiting for the signed-in person to take over as owner.
create or replace function public.my_owner_invites() returns table (shop_id uuid, shop_name text)
language sql stable security definer set search_path = '' as $$
  select i.shop_id, s.name
  from public.shop_owner_invites i join public.shops s on s.id = i.shop_id
  where i.email = lower(auth.jwt() ->> 'email');
$$;

-- The invited person accepts and becomes the owner.
create or replace function public.accept_owner_invite(p_shop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
begin
  if not exists (select 1 from public.shop_owner_invites i
                 where i.shop_id = p_shop and i.email = lower(auth.jwt() ->> 'email')) then
    raise exception 'That invite is no longer valid';
  end if;
  if exists (select 1 from public.shop_members m where m.user_id = auth.uid() and m.shop_id <> p_shop) then
    raise exception 'You already belong to another shop';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Finish setting up your profile first'; end if;

  -- Anyone still marked as owner (if the old owner kept their account) becomes a barber.
  update public.shop_members set role = 'barber' where shop_id = p_shop and role = 'owner' and user_id <> auth.uid();
  insert into public.shop_members (shop_id, user_id, role, display_name)
    values (p_shop, auth.uid(), 'owner', me.first_name)
    on conflict (shop_id, user_id) do update set role = 'owner';
  update public.shops set owner_id = auth.uid() where id = p_shop;
  delete from public.shop_owner_invites where shop_id = p_shop;
  update public.profiles set kind = 'staff', shop_id = null where id = auth.uid();
end;
$$;

revoke execute on function public.transfer_shop_to_member, public.invite_shop_owner, public.my_owner_invites,
  public.accept_owner_invite from public, anon;
grant execute on function public.transfer_shop_to_member, public.invite_shop_owner, public.my_owner_invites,
  public.accept_owner_invite to authenticated;

-- Admin view: show shops waiting for a new owner.
create or replace function public.admin_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  month_start timestamptz := date_trunc('month', p_month)::timestamptz;
  month_end timestamptz := (date_trunc('month', p_month) + interval '1 month')::timestamptz;
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'shops', (select count(*) from public.shops),
      'barbers', (select count(*) from public.shop_members),
      'customers', (select count(*) from public.profiles p where p.kind = 'customer'),
      'customers_linked', (select count(*) from public.profiles p where p.kind = 'customer' and p.shop_id is not null),
      'new_accounts_month', (select count(*) from public.profiles p where p.created_at >= month_start and p.created_at < month_end),
      'recommendations_month', (select count(*) from public.recommendations r where r.created_at >= month_start and r.created_at < month_end),
      'ai_cost_month', (select coalesce(sum(r.cost_usd), 0) from public.recommendations r where r.created_at >= month_start and r.created_at < month_end),
      'ai_cost_all_time', (select coalesce(sum(r.cost_usd), 0) from public.recommendations r),
      'cut_cards_month', (select count(*) from public.cut_cards c where c.created_at >= month_start and c.created_at < month_end),
      'bookings_month', (select count(*) from public.appointments a where a.created_at >= month_start and a.created_at < month_end)
    ),
    'shops', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.recommendations_month desc, x.name)
      from (
        select
          s.id, s.name, s.address, s.created_at,
          (select u.email from auth.users u where u.id = s.owner_id) as owner_email,
          (select i.email from public.shop_owner_invites i where i.shop_id = s.id) as pending_owner_email,
          (select count(*) from public.shop_members m where m.shop_id = s.id) as team,
          (select count(*) from public.profiles p where p.shop_id = s.id) as clients,
          (select count(*) from public.recommendations r
            where r.shop_id = s.id and r.created_at >= month_start and r.created_at < month_end) as recommendations_month,
          (select coalesce(sum(r.cost_usd), 0) from public.recommendations r
            where r.shop_id = s.id and r.created_at >= month_start and r.created_at < month_end) as ai_cost_month,
          (select count(*) from public.cut_cards c
            where c.shop_id = s.id and c.created_at >= month_start and c.created_at < month_end) as cut_cards_month,
          (select count(*) from public.appointments a
            where a.shop_id = s.id and a.created_at >= month_start and a.created_at < month_end) as bookings_month
        from public.shops s
      ) x), '[]'::jsonb)
  );
end;
$$;
