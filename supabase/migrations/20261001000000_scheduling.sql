-- Shape Up: barber hours and appointment booking
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run, once).
--
-- Adds:
--   * shop settings: appointment length and time zone
--   * barber_hours: each barber's weekly hours (several blocks per day allowed, e.g. around lunch)
--   * barber_days_off: specific dates a barber isn't working
--   * appointments: bookings. The database itself refuses two bookings for the
--     same barber at overlapping times, so double-booking is impossible.
--   * available_slots(), book_appointment(), cancel_appointment(), and the lists the app shows
-- ------------------------------------------------------------------

-- Lets the database check "same barber AND overlapping time" in one rule.
create extension if not exists btree_gist with schema extensions;

-- ============ Shop settings ============

alter table public.shops
  add column appointment_minutes integer not null default 30
    check (appointment_minutes in (15, 20, 30, 45, 60, 90)),
  add column timezone text; -- e.g. 'America/Chicago'; set by the app from the owner's phone
grant update (appointment_minutes, timezone) on public.shops to authenticated;

-- The shop's time zone, with a safe fallback while it hasn't been set yet.
create function public.shop_timezone(p_shop uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(s.timezone, 'America/New_York') from public.shops s where s.id = p_shop;
$$;

-- ============ Barber hours ============

create table public.barber_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  barber_id uuid not null references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index barber_hours_barber on public.barber_hours (barber_id, weekday);

create table public.barber_days_off (
  shop_id uuid not null references public.shops (id) on delete cascade,
  barber_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (barber_id, day)
);

-- A barber edits their own hours; the owner can edit anyone's in their shop.
create function public.can_edit_barber_schedule(p_shop uuid, p_barber uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = p_barber)
     and (p_barber = auth.uid() or public.is_shop_owner(p_shop));
$$;

alter table public.barber_hours enable row level security;
alter table public.barber_days_off enable row level security;
revoke all on public.barber_hours, public.barber_days_off from anon, authenticated;
grant select, insert, update, delete on public.barber_hours, public.barber_days_off to authenticated;

create policy "hours: shop staff read" on public.barber_hours for select to authenticated
  using (public.is_shop_staff(shop_id));
create policy "hours: barber or owner adds" on public.barber_hours for insert to authenticated
  with check (public.can_edit_barber_schedule(shop_id, barber_id));
create policy "hours: barber or owner edits" on public.barber_hours for update to authenticated
  using (public.can_edit_barber_schedule(shop_id, barber_id))
  with check (public.can_edit_barber_schedule(shop_id, barber_id));
create policy "hours: barber or owner removes" on public.barber_hours for delete to authenticated
  using (public.can_edit_barber_schedule(shop_id, barber_id));

create policy "days off: shop staff read" on public.barber_days_off for select to authenticated
  using (public.is_shop_staff(shop_id));
create policy "days off: barber or owner adds" on public.barber_days_off for insert to authenticated
  with check (public.can_edit_barber_schedule(shop_id, barber_id));
create policy "days off: barber or owner removes" on public.barber_days_off for delete to authenticated
  using (public.can_edit_barber_schedule(shop_id, barber_id));

-- ============ Appointments ============

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  barber_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'done', 'no_show')),
  cancelled_by text check (cancelled_by in ('customer', 'shop')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- The no-double-booking rule: one barber can't have two active bookings that overlap.
  constraint appointments_no_overlap exclude using gist (
    barber_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'done'))
);
create index appointments_shop_time on public.appointments (shop_id, starts_at);
create index appointments_customer on public.appointments (customer_id, starts_at);
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
-- Bookings are only made and cancelled through the functions below, which check the rules.
-- Staff can mark an appointment done / no-show / cancelled directly.
grant select on public.appointments to authenticated;
grant update (status, cancelled_by) on public.appointments to authenticated;
create policy "appointments: customer and their shop read" on public.appointments for select to authenticated
  using (customer_id = auth.uid() or public.is_shop_staff(shop_id));
create policy "appointments: shop staff update status" on public.appointments for update to authenticated
  using (public.is_shop_staff(shop_id)) with check (public.is_shop_staff(shop_id));

-- Barbers' "Upcoming cuts" tab will want live updates for bookings too.
alter publication supabase_realtime add table public.appointments;

-- ============ Open times ============

-- Every open time at a shop between two dates (in the shop's time zone), for one barber
-- or all of them. Only the shop's staff and customers linked to the shop can ask.
create function public.available_slots(p_shop uuid, p_barber uuid, p_from date, p_days integer)
returns table (barber_id uuid, barber_name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with settings as (
    select public.shop_timezone(p_shop) as tz,
           make_interval(mins => s.appointment_minutes) as len
    from public.shops s where s.id = p_shop
  ),
  days as (
    select d::date as day
    from generate_series(p_from::timestamp, (p_from + least(greatest(p_days, 1), 60) - 1)::timestamp, interval '1 day') d
  ),
  candidates as (
    select h.barber_id, m.display_name,
           (slot_local at time zone settings.tz) as starts_at,
           ((slot_local + settings.len) at time zone settings.tz) as ends_at
    from settings
    cross join days
    join public.barber_hours h on h.shop_id = p_shop and h.weekday = extract(dow from days.day)
    join public.shop_members m on m.shop_id = p_shop and m.user_id = h.barber_id
    cross join lateral generate_series(
      days.day + h.start_time,
      days.day + h.end_time - settings.len,
      settings.len
    ) slot_local
    where (p_barber is null or h.barber_id = p_barber)
      and not exists (select 1 from public.barber_days_off o where o.barber_id = h.barber_id and o.day = days.day)
  )
  select distinct c.barber_id, c.display_name, c.starts_at, c.ends_at
  from candidates c
  where c.starts_at > now() + interval '15 minutes'
    and (public.is_shop_staff(p_shop) or public.my_customer_shop() = p_shop)
    and not exists (
      select 1 from public.appointments a
      where a.barber_id = c.barber_id and a.status in ('booked', 'done')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
  order by c.starts_at, c.display_name;
$$;

-- A customer books an open time with a barber at the shop they're linked to.
create function public.book_appointment(p_barber uuid, p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid := public.my_customer_shop();
  v_slot record;
  v_id uuid;
begin
  if v_shop is null then raise exception 'Link to a barbershop first by scanning its QR code'; end if;
  if (select count(*) from public.appointments a
      where a.customer_id = auth.uid() and a.status = 'booked' and a.starts_at > now()) >= 2 then
    raise exception 'You already have 2 upcoming appointments. Cancel one to book another.';
  end if;
  select * into v_slot
  from public.available_slots(v_shop, p_barber, (p_starts_at at time zone public.shop_timezone(v_shop))::date, 1) s
  where s.starts_at = p_starts_at;
  if v_slot.starts_at is null then
    raise exception 'Sorry, that time was just taken or is no longer available. Pick another time.';
  end if;
  begin
    insert into public.appointments (shop_id, barber_id, customer_id, starts_at, ends_at)
      values (v_shop, p_barber, auth.uid(), v_slot.starts_at, v_slot.ends_at)
      returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Sorry, that time was just taken. Pick another time.';
  end;
  return v_id;
end;
$$;

-- A customer cancels their own upcoming appointment.
create function public.cancel_appointment(p_appointment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.appointments a
    set status = 'cancelled', cancelled_by = 'customer'
    where a.id = p_appointment and a.customer_id = auth.uid() and a.status = 'booked' and a.starts_at > now();
  if not found then raise exception 'That appointment can’t be cancelled here. Call the shop instead.'; end if;
end;
$$;

-- The customer's appointments, with shop and barber names.
create function public.my_appointments() returns table (
  appointment_id uuid, shop_name text, barber_name text, starts_at timestamptz, ends_at timestamptz, status text
)
language sql stable security definer set search_path = '' as $$
  select a.id, s.name, m.display_name, a.starts_at, a.ends_at, a.status
  from public.appointments a
  join public.shops s on s.id = a.shop_id
  left join public.shop_members m on m.shop_id = a.shop_id and m.user_id = a.barber_id
  where a.customer_id = auth.uid() and a.starts_at > now() - interval '1 day'
  order by a.starts_at;
$$;

-- The shop's appointments between two times, with client and barber names. Staff only.
create function public.shop_appointments(p_shop uuid, p_from timestamptz, p_to timestamptz) returns table (
  appointment_id uuid, barber_id uuid, barber_name text, customer_id uuid, customer_name text,
  customer_has_photo boolean, starts_at timestamptz, ends_at timestamptz, status text, cancelled_by text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.barber_id, m.display_name, a.customer_id, p.first_name, p.avatar_updated_at is not null,
         a.starts_at, a.ends_at, a.status, a.cancelled_by
  from public.appointments a
  join public.profiles p on p.id = a.customer_id
  left join public.shop_members m on m.shop_id = a.shop_id and m.user_id = a.barber_id
  where a.shop_id = p_shop and a.starts_at >= p_from and a.starts_at < p_to
    and public.is_shop_staff(p_shop)
  order by a.starts_at;
$$;

-- Customers with a booking count as the shop's clients (Clients tab, profile photo).
create or replace function public.is_my_shops_client(p_shop uuid, p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_shop_staff(p_shop) and (
    exists (select 1 from public.profiles p where p.id = p_customer and p.shop_id = p_shop)
    or exists (select 1 from public.cut_cards c where c.customer_id = p_customer and c.shop_id = p_shop)
    or exists (select 1 from public.shop_client_access a where a.customer_id = p_customer and a.shop_id = p_shop)
    or exists (select 1 from public.appointments a where a.customer_id = p_customer and a.shop_id = p_shop)
  );
$$;

revoke execute on function public.shop_timezone, public.can_edit_barber_schedule, public.available_slots,
  public.book_appointment, public.cancel_appointment, public.my_appointments, public.shop_appointments
  from public, anon;
grant execute on function public.shop_timezone, public.can_edit_barber_schedule, public.available_slots,
  public.book_appointment, public.cancel_appointment, public.my_appointments, public.shop_appointments
  to authenticated;
