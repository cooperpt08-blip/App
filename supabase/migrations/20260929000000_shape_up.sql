-- Shape Up database
-- ------------------------------------------------------------------
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
--
-- Plain-language summary:
--   profiles          one row per person: first name, and which shop a customer is linked to
--   shops             barbershops: name, address, and the code inside their QR
--   shop_members      who works at each shop (the owner and their barbers)
--   barber_invites    emails the owner has invited to join as barbers
--   recommendations   each AI recommendation a customer got (used for monthly limits)
--   cut_cards         a chosen cut a customer sent to their shop, with appointment + status
--   storage bucket    "cut-card-photos", private, holds photos customers agreed to share
--
-- Security ("row level security"): every table is locked by default, and the rules
-- below open up only what each person is allowed to see. A barber can only ever see
-- their own shop's cut cards and photos. Customers only see their own data.
-- ------------------------------------------------------------------

-- ============ Tables ============

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  address text not null default '' check (char_length(address) <= 200),
  join_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 40),
  -- 'customer' uses the haircut side of the app; 'staff' uses the barbershop side.
  kind text not null default 'customer' check (kind in ('customer', 'staff')),
  -- The shop a customer is linked to (from scanning its QR code).
  shop_id uuid references public.shops (id) on delete set null,
  shop_joined_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade, -- one shop per person
  role text not null check (role in ('owner', 'barber')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table public.barber_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  invited_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shop_id, email)
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete set null,
  answers jsonb not null,
  result jsonb not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index recommendations_customer_created on public.recommendations (customer_id, created_at);

create table public.cut_cards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  recommendation_id uuid references public.recommendations (id) on delete set null,
  barber_id uuid references auth.users (id) on delete set null, -- optional: a specific barber
  customer_first_name text not null,
  cut jsonb not null check (jsonb_typeof(cut) = 'object' and cut ? 'name'),
  hair jsonb not null check (jsonb_typeof(hair) = 'object'),
  customer_note text not null default '' check (char_length(customer_note) <= 500),
  appointment_at timestamptz,
  status text not null default 'new' check (status in ('new', 'seen', 'in_chair', 'done')),
  barber_notes text not null default '' check (char_length(barber_notes) <= 2000),
  has_side_photo boolean not null default false,
  has_preview boolean not null default false,
  photo_consent_at timestamptz not null,
  photos_delete_after timestamptz not null,
  photos_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cut_cards_shop_appt on public.cut_cards (shop_id, appointment_at);
create index cut_cards_cleanup on public.cut_cards (photos_delete_after) where photos_deleted_at is null;

-- ============ Helper functions ============
-- "security definer" lets these look up membership without tripping over the
-- very security rules they are used in. They only ever answer yes/no about the
-- person who is signed in.

create function public.is_shop_staff(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = auth.uid());
$$;

create function public.is_shop_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Same as is_shop_staff, but takes the shop id as text (from a photo's folder name).
create function public.is_shop_staff_text(p_shop text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id::text = p_shop and m.user_id = auth.uid());
$$;

create function public.my_customer_shop() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.shop_id from public.profiles p where p.id = auth.uid();
$$;

create function public.new_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O or 1/I mix-ups
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.shops s where s.join_code = code);
  end loop;
  return code;
end;
$$;

alter table public.shops alter column join_code set default public.new_join_code();

-- ============ Actions the app calls ============

-- A shop owner creates their shop. They become its first member (the owner).
create function public.create_shop(p_name text, p_address text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_shop uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.shop_members where user_id = auth.uid()) then
    raise exception 'You already belong to a shop';
  end if;
  insert into public.shops (name, address, owner_id)
    values (trim(p_name), trim(coalesce(p_address, '')), auth.uid())
    returning id into new_shop;
  insert into public.shop_members (shop_id, user_id, role, display_name)
    values (new_shop, auth.uid(), 'owner', trim(p_display_name));
  update public.profiles set kind = 'staff', shop_id = null where id = auth.uid();
  return new_shop;
end;
$$;

-- The owner makes a new QR code (for example if the old one was shared too widely).
create function public.regenerate_join_code(p_shop uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_shop_owner(p_shop) then raise exception 'Only the shop owner can do that'; end if;
  code := public.new_join_code();
  update public.shops set join_code = code where id = p_shop;
  return code;
end;
$$;

-- A customer scans a shop's QR code (or types the code) to link to that shop.
create function public.join_shop(p_code text) returns table (joined_shop_id uuid, joined_shop_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_shop public.shops;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_shop from public.shops s where s.join_code = upper(trim(p_code));
  if v_shop.id is null then raise exception 'We could not find a shop with that code'; end if;
  update public.profiles p
    set shop_id = v_shop.id, shop_joined_at = now()
    where p.id = auth.uid() and p.kind = 'customer';
  if not found then raise exception 'Only customer accounts can join a shop'; end if;
  return query select v_shop.id, v_shop.name;
end;
$$;

-- Invites waiting for the signed-in person's email address.
create function public.my_invites() returns table (invite_id uuid, shop_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, s.name
  from public.barber_invites i join public.shops s on s.id = i.shop_id
  where i.accepted_at is null and i.email = lower(auth.jwt() ->> 'email');
$$;

-- A barber accepts an invite and joins the shop.
create function public.accept_invite(p_invite uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.barber_invites;
  me public.profiles;
begin
  select * into inv from public.barber_invites
    where id = p_invite and accepted_at is null and email = lower(auth.jwt() ->> 'email');
  if inv.id is null then raise exception 'That invite is no longer valid'; end if;
  if exists (select 1 from public.shop_members where user_id = auth.uid()) then
    raise exception 'You already belong to a shop';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Finish setting up your profile first'; end if;
  insert into public.shop_members (shop_id, user_id, role, display_name)
    values (inv.shop_id, auth.uid(), 'barber', me.first_name);
  update public.barber_invites set accepted_at = now() where id = inv.id;
  update public.profiles set kind = 'staff', shop_id = null where id = auth.uid();
  return inv.shop_id;
end;
$$;

-- ============ Automatic fields on cut cards ============
-- Filled in by the database, so the app can't fake them.

create function public.cut_cards_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'new';
  new.barber_notes := '';
  new.created_at := now();
  new.updated_at := now();
  new.photos_deleted_at := null;
  new.photo_consent_at := least(new.photo_consent_at, now());
  select p.first_name into new.customer_first_name from public.profiles p where p.id = new.customer_id;
  if new.appointment_at is not null
     and (new.appointment_at < now() - interval '1 day' or new.appointment_at > now() + interval '1 year') then
    raise exception 'Appointment time must be within the next year';
  end if;
  -- Photos are deleted 7 days after the appointment, or 30 days after sending if no appointment.
  new.photos_delete_after := coalesce(new.appointment_at + interval '7 days', now() + interval '30 days');
  return new;
end;
$$;
create trigger cut_cards_before_insert before insert on public.cut_cards
  for each row execute function public.cut_cards_before_insert();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger cut_cards_touch before update on public.cut_cards
  for each row execute function public.touch_updated_at();

-- ============ Security rules ============

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.barber_invites enable row level security;
alter table public.recommendations enable row level security;
alter table public.cut_cards enable row level security;

-- Start from "nobody can do anything", then grant exactly what's needed.
revoke all on public.profiles, public.shops, public.shop_members, public.barber_invites,
  public.recommendations, public.cut_cards from anon, authenticated;

-- profiles: you can see and create your own; you can only change your first name.
grant select, delete on public.profiles to authenticated;
grant insert (id, first_name) on public.profiles to authenticated;
grant update (first_name) on public.profiles to authenticated;
create policy "own profile: read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile: create" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile: edit" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile: delete" on public.profiles for delete to authenticated using (id = auth.uid());

-- shops: staff and linked customers can see their shop; only the owner can edit name/address.
grant select on public.shops to authenticated;
grant update (name, address) on public.shops to authenticated;
create policy "shop: staff and linked customers read" on public.shops for select to authenticated
  using (public.is_shop_staff(id) or id = public.my_customer_shop());
create policy "shop: owner edits" on public.shops for update to authenticated
  using (public.is_shop_owner(id));

-- shop_members: staff see their team; linked customers see the barbers' names so they can pick one.
grant select, delete on public.shop_members to authenticated;
create policy "members: shop can read" on public.shop_members for select to authenticated
  using (public.is_shop_staff(shop_id) or shop_id = public.my_customer_shop());
create policy "members: owner removes barber, barber can leave" on public.shop_members for delete to authenticated
  using (role = 'barber' and (public.is_shop_owner(shop_id) or user_id = auth.uid()));

-- barber_invites: only the shop owner can see, add, or cancel invites.
grant select, delete on public.barber_invites to authenticated;
grant insert (shop_id, email) on public.barber_invites to authenticated;
create policy "invites: owner reads" on public.barber_invites for select to authenticated
  using (public.is_shop_owner(shop_id));
create policy "invites: owner adds" on public.barber_invites for insert to authenticated
  with check (public.is_shop_owner(shop_id) and invited_by = auth.uid());
create policy "invites: owner cancels" on public.barber_invites for delete to authenticated
  using (public.is_shop_owner(shop_id));

-- recommendations: customers can read their own. Only the server (which checks the
-- monthly limit) can add them.
grant select on public.recommendations to authenticated;
create policy "recommendations: own" on public.recommendations for select to authenticated
  using (customer_id = auth.uid());

-- cut_cards
grant select, delete on public.cut_cards to authenticated;
grant insert (id, shop_id, customer_id, recommendation_id, barber_id, cut, hair, customer_note,
  appointment_at, has_side_photo, has_preview, photo_consent_at) on public.cut_cards to authenticated;
grant update (status, barber_notes) on public.cut_cards to authenticated; -- barbers only change these

create policy "cards: customer and their shop read" on public.cut_cards for select to authenticated
  using (customer_id = auth.uid() or public.is_shop_staff(shop_id));
create policy "cards: customer sends to own shop" on public.cut_cards for insert to authenticated
  with check (
    customer_id = auth.uid()
    and shop_id = public.my_customer_shop()
    and (barber_id is null or exists (
      select 1 from public.shop_members m where m.shop_id = cut_cards.shop_id and m.user_id = cut_cards.barber_id))
    and (recommendation_id is null or exists (
      select 1 from public.recommendations r where r.id = cut_cards.recommendation_id and r.customer_id = auth.uid()))
  );
create policy "cards: shop staff update status and notes" on public.cut_cards for update to authenticated
  using (public.is_shop_staff(shop_id)) with check (public.is_shop_staff(shop_id));
create policy "cards: customer can cancel" on public.cut_cards for delete to authenticated
  using (customer_id = auth.uid());

-- Only signed-in people can call the actions above.
revoke execute on function public.create_shop, public.regenerate_join_code, public.join_shop,
  public.my_invites, public.accept_invite, public.is_shop_staff, public.is_shop_owner,
  public.is_shop_staff_text, public.my_customer_shop, public.new_join_code from public, anon;
grant execute on function public.create_shop, public.regenerate_join_code, public.join_shop,
  public.my_invites, public.accept_invite, public.is_shop_staff, public.is_shop_owner,
  public.is_shop_staff_text, public.my_customer_shop to authenticated;

-- ============ Live updates ============
-- Lets the barber's "Upcoming cuts" tab get new cards instantly. Supabase still
-- applies the security rules above, so each shop only hears about its own cards.
alter publication supabase_realtime add table public.cut_cards;

-- ============ Private photo storage ============
-- Files are stored as  <shop id>/<customer id>/<card id>/front.jpg  (also side.jpg, preview.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cut-card-photos', 'cut-card-photos', false, 5242880, array['image/jpeg']);

-- A customer can upload only into their own folder, inside the shop they're linked to.
create policy "photos: customer uploads to own shop folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cut-card-photos'
    and (storage.foldername(name))[1] = public.my_customer_shop()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
-- The customer and that shop's staff can view the photos. Nobody else can.
create policy "photos: customer and their shop view" on storage.objects for select to authenticated
  using (
    bucket_id = 'cut-card-photos'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_shop_staff_text((storage.foldername(name))[1])
    )
  );
-- A customer can delete their own photos at any time.
create policy "photos: customer deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'cut-card-photos' and (storage.foldername(name))[2] = auth.uid()::text);
