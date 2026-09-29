-- Shape Up: Clients tab and sharing cut cards with a new shop
-- ------------------------------------------------------------------
-- Run this AFTER the first file (20260929000000_shape_up.sql):
-- SQL Editor -> New query -> paste this whole file -> Run.
--
-- Adds:
--   * an optional profile photo for customers, which shops they use can see
--   * client_notes: a barber's note of a client's usual cut (only that shop sees it)
--   * client share codes: a customer shows a QR code at a new shop; when a barber
--     scans it, that shop can see the customer's name, photo and cut cards
--   * shop_clients() / client_cut_cards(): what the Clients tab shows
--
-- Who counts as a shop's client:
--   1. customers linked to the shop (they scanned the shop's QR code), or
--   2. customers who sent the shop a cut card, or
--   3. customers who let the shop scan their cut card code.
-- ------------------------------------------------------------------

-- ============ Tables ============

-- When the customer last set a profile photo (empty = no photo).
alter table public.profiles add column avatar_updated_at timestamptz;
grant update (avatar_updated_at) on public.profiles to authenticated;

-- Shops a customer shared their cut cards with by showing their code.
create table public.shop_client_access (
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (shop_id, customer_id)
);

-- Short-lived codes a customer shows at a new shop. Only reachable through the functions below.
create table public.client_share_codes (
  code text primary key,
  customer_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

-- A shop's own notes about a client. Other shops and the client can't see them.
create table public.client_notes (
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  usual_cut text not null default '' check (char_length(usual_cut) <= 500),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, customer_id)
);
create trigger client_notes_touch before update on public.client_notes
  for each row execute function public.touch_updated_at();

-- ============ Helper ============

-- Is this person a client of this shop, and am I staff there?
create function public.is_my_shops_client(p_shop uuid, p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_shop_staff(p_shop) and (
    exists (select 1 from public.profiles p where p.id = p_customer and p.shop_id = p_shop)
    or exists (select 1 from public.cut_cards c where c.customer_id = p_customer and c.shop_id = p_shop)
    or exists (select 1 from public.shop_client_access a where a.customer_id = p_customer and a.shop_id = p_shop)
  );
$$;

-- ============ Security rules ============

alter table public.shop_client_access enable row level security;
alter table public.client_share_codes enable row level security;
alter table public.client_notes enable row level security;
revoke all on public.shop_client_access, public.client_share_codes, public.client_notes from anon, authenticated;

-- shop_client_access: a customer can remove a shop's access; staff can remove it too.
-- New access is only created by scanning a code (redeem_share_code below).
grant select, delete on public.shop_client_access to authenticated;
create policy "access: customer or that shop reads" on public.shop_client_access for select to authenticated
  using (customer_id = auth.uid() or public.is_shop_staff(shop_id));
create policy "access: customer or that shop removes" on public.shop_client_access for delete to authenticated
  using (customer_id = auth.uid() or public.is_shop_staff(shop_id));

-- client_share_codes: no direct access at all (functions only).

-- client_notes: only the shop's own staff, only about their clients.
grant select, delete on public.client_notes to authenticated;
grant insert (shop_id, customer_id, usual_cut) on public.client_notes to authenticated;
-- (shop and customer are listed so the app can "save or update" in one step)
grant update (shop_id, customer_id, usual_cut) on public.client_notes to authenticated;
create policy "client notes: shop staff read" on public.client_notes for select to authenticated
  using (public.is_shop_staff(shop_id));
create policy "client notes: shop staff add" on public.client_notes for insert to authenticated
  with check (public.is_my_shops_client(shop_id, customer_id) and updated_by = auth.uid());
create policy "client notes: shop staff edit" on public.client_notes for update to authenticated
  using (public.is_shop_staff(shop_id)) with check (public.is_my_shops_client(shop_id, customer_id));
create policy "client notes: shop staff delete" on public.client_notes for delete to authenticated
  using (public.is_shop_staff(shop_id));

-- ============ Sharing with a new shop ============

-- Customer: make a code to show at a new shop. Valid for 10 minutes, replaces any older code.
create function public.create_share_code() returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.kind = 'customer') then
    raise exception 'Only customer accounts can share a cut card';
  end if;
  delete from public.client_share_codes s where s.customer_id = auth.uid() or s.expires_at < now();
  loop
    new_code := '';
    for i in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.client_share_codes s where s.code = new_code);
  end loop;
  insert into public.client_share_codes (code, customer_id, expires_at)
    values (new_code, auth.uid(), now() + interval '10 minutes');
  return query select new_code, now() + interval '10 minutes';
end;
$$;

-- Barber: scan or type a customer's code. Their shop can then see that customer.
create function public.redeem_share_code(p_code text) returns table (customer_id uuid, first_name text)
language plpgsql security definer set search_path = '' as $$
declare
  my_shop uuid;
  who uuid;
begin
  select m.shop_id into my_shop from public.shop_members m where m.user_id = auth.uid();
  if my_shop is null then raise exception 'Only barbershop accounts can scan a client code'; end if;
  select s.customer_id into who from public.client_share_codes s
    where s.code = upper(trim(p_code)) and s.expires_at > now();
  if who is null then raise exception 'That code is wrong or has expired. Ask the client to show a new one.'; end if;
  insert into public.shop_client_access (shop_id, customer_id) values (my_shop, who)
    on conflict on constraint shop_client_access_pkey do nothing;
  delete from public.client_share_codes s where s.code = upper(trim(p_code));
  return query select p.id, p.first_name from public.profiles p where p.id = who;
end;
$$;

-- Customer: which shops can see my cut cards because I shared my code with them.
create function public.my_shared_shops() returns table (shop_id uuid, shop_name text, granted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.shop_id, s.name, a.granted_at
  from public.shop_client_access a join public.shops s on s.id = a.shop_id
  where a.customer_id = auth.uid()
  order by a.granted_at desc;
$$;

-- ============ What the Clients tab shows ============

-- The shop's client list. Only staff of the shop get any rows back.
-- usual_cut: the barber's note if there is one, otherwise the cut from the client's latest card.
-- mine: the client picked me as their barber on at least one card.
create function public.shop_clients(p_shop uuid)
returns table (
  customer_id uuid,
  first_name text,
  avatar_updated_at timestamptz,
  linked boolean,
  shared boolean,
  usual_cut text,
  usual_cut_is_note boolean,
  last_cut_at timestamptz,
  mine boolean
)
language sql stable security definer set search_path = '' as $$
  with clients as (
    select p.id from public.profiles p where p.shop_id = p_shop
    union
    select c.customer_id from public.cut_cards c where c.shop_id = p_shop
    union
    select a.customer_id from public.shop_client_access a where a.shop_id = p_shop
  )
  select
    p.id,
    p.first_name,
    p.avatar_updated_at,
    p.shop_id is not distinct from p_shop,
    exists (select 1 from public.shop_client_access a where a.shop_id = p_shop and a.customer_id = p.id),
    coalesce(nullif(n.usual_cut, ''), last_card.cut ->> 'name'),
    coalesce(n.usual_cut, '') <> '',
    last_card.created_at,
    exists (select 1 from public.cut_cards c
            where c.shop_id = p_shop and c.customer_id = p.id and c.barber_id = auth.uid())
  from clients
  join public.profiles p on p.id = clients.id
  left join public.client_notes n on n.shop_id = p_shop and n.customer_id = p.id
  left join lateral (
    -- Latest card sent to this shop; if the client shared their code, their latest card anywhere.
    select c.cut, c.created_at from public.cut_cards c
    where c.customer_id = p.id
      and (c.shop_id = p_shop or exists (
        select 1 from public.shop_client_access a where a.shop_id = p_shop and a.customer_id = p.id))
    order by c.created_at desc limit 1
  ) last_card on true
  where public.is_shop_staff(p_shop)
  order by p.first_name;
$$;

-- A client's cut cards, newest first, for the client detail screen. Staff only.
-- Cards sent to this shop show everything the shop already had. If the client shared
-- their code, cards from other shops are included too, but only the cut itself and
-- the hair details: never the other shop's name, notes, status, or photos.
create function public.client_cut_cards(p_shop uuid, p_customer uuid)
returns table (
  card_id uuid,
  from_this_shop boolean,
  cut jsonb,
  hair jsonb,
  customer_note text,
  created_at timestamptz,
  appointment_at timestamptz,
  status text,
  barber_name text
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.shop_id = p_shop,
    c.cut,
    c.hair,
    case when c.shop_id = p_shop then c.customer_note else '' end,
    c.created_at,
    case when c.shop_id = p_shop then c.appointment_at end,
    case when c.shop_id = p_shop then c.status end,
    case when c.shop_id = p_shop then m.display_name end
  from public.cut_cards c
  left join public.shop_members m on m.shop_id = c.shop_id and m.user_id = c.barber_id
  where c.customer_id = p_customer
    and public.is_shop_staff(p_shop)
    and (c.shop_id = p_shop or exists (
      select 1 from public.shop_client_access a where a.shop_id = p_shop and a.customer_id = p_customer))
  order by c.created_at desc
  limit 50;
$$;

revoke execute on function public.is_my_shops_client, public.create_share_code, public.redeem_share_code,
  public.my_shared_shops, public.shop_clients, public.client_cut_cards from public, anon;
grant execute on function public.is_my_shops_client, public.create_share_code, public.redeem_share_code,
  public.my_shared_shops, public.shop_clients, public.client_cut_cards to authenticated;

-- ============ Profile photos ============
-- Stored as  <customer id>/avatar.jpg  in a private bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg']);

-- Can I see the profile photo in this folder? Yes if it's mine, or it's a client of my shop.
create function public.can_see_profile_photo(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_folder = auth.uid()::text or exists (
    select 1
    from public.shop_members m
    join public.profiles p on p.id::text = p_folder
    where m.user_id = auth.uid() and public.is_my_shops_client(m.shop_id, p.id)
  );
$$;
revoke execute on function public.can_see_profile_photo from public, anon;
grant execute on function public.can_see_profile_photo to authenticated;

create policy "profile photo: owner adds" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile photo: owner replaces" on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile photo: owner removes" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile photo: owner and their shops view" on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and public.can_see_profile_photo((storage.foldername(name))[1]));
