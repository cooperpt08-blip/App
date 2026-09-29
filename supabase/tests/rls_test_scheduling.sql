-- FOR LOCAL TESTING ONLY. Run after rls_test.sql and rls_test_clients.sql, on the same test database.
\set ON_ERROR_STOP on
create function pg_temp.as_user(p_id text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email)::text, false);
$$;
create function pg_temp.expect(cond boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.expect_error(stmt text, what text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok: % (blocked: %)', what, sqlerrm; return; end;
  raise exception 'FAILED: % (was allowed)', what;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
select id as shop_a from public.shops where name = 'Fade Factory' \gset
select id as shop_b from public.shops where name = 'Clip Joint' \gset
select (current_date + 1) as tomorrow, extract(dow from current_date + 1)::int as dow \gset
\set barber '00000000-0000-0000-0000-0000000000ba'
\set owner_a '00000000-0000-0000-0000-00000000000a'
set role authenticated;

-- Owner A sets the shop to UTC and 30-minute appointments
select pg_temp.as_user(:'owner_a', 'owner.a@example.com');
update public.shops set timezone = 'UTC', appointment_minutes = 30 where id = :'shop_a';
select pg_temp.expect((select timezone from public.shops where id = :'shop_a') = 'UTC', 'owner sets time zone');

-- Barber Sam sets hours for tomorrow: 9:00-12:00
select pg_temp.as_user(:'barber', 'barber.a@example.com');
insert into public.barber_hours (shop_id, barber_id, weekday, start_time, end_time)
  values (:'shop_a', auth.uid(), :dow, '09:00', '12:00');
select pg_temp.expect((select count(*) from public.barber_hours) = 1, 'barber saves their hours');
select pg_temp.expect_error(format($q$insert into public.barber_hours (shop_id, barber_id, weekday, start_time, end_time) values (%L, %L, 1, '09:00', '10:00')$q$, :'shop_a', :'owner_a'),
  'a barber cannot change the owner''s hours');
update public.shops set appointment_minutes = 90 where id = :'shop_a';
select pg_temp.expect((select appointment_minutes from public.shops where id = :'shop_a') = 30, 'a barber cannot change the appointment length');

-- Owner B cannot touch shop A's schedule
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect_error(format($q$insert into public.barber_hours (shop_id, barber_id, weekday, start_time, end_time) values (%L, %L, 1, '09:00', '10:00')$q$, :'shop_a', :'barber'),
  'another shop cannot set shop A barber hours');
select pg_temp.expect((select count(*) from public.barber_hours) = 0, 'another shop cannot see shop A hours');
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 0, 'another shop cannot list shop A open times');

-- Customer 2 is not linked to shop A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 0, 'unlinked customer sees no open times');
select pg_temp.expect_error(format($q$select public.book_appointment(%L, %L)$q$, :'barber', (:'tomorrow' || ' 09:00+00')),
  'unlinked customer cannot book');

-- Customer 1 (linked to shop A) books
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 6, 'linked customer sees 6 open times (9:00 to 11:30)');
select pg_temp.expect((select barber_name from public.available_slots(:'shop_a', null, :'tomorrow', 1) limit 1) = 'Sam', 'open times show the barber''s name');
select public.book_appointment(:'barber', (:'tomorrow' || ' 09:00+00')::timestamptz);
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 5, 'the booked time disappears from open times');
select pg_temp.expect_error(format($q$select public.book_appointment(%L, %L)$q$, :'barber', (:'tomorrow' || ' 09:00+00')),
  'the same time cannot be booked twice');
select pg_temp.expect_error(format($q$select public.book_appointment(%L, %L)$q$, :'barber', (:'tomorrow' || ' 09:15+00')),
  'a time that is not an open slot cannot be booked');
select pg_temp.expect_error(format($q$select public.book_appointment(%L, %L)$q$, :'barber', (:'tomorrow' || ' 13:00+00')),
  'a time outside the barber''s hours cannot be booked');
select pg_temp.expect_error(format($q$insert into public.appointments (shop_id, barber_id, customer_id, starts_at, ends_at) values (%L, %L, auth.uid(), now(), now() + interval '1 hour')$q$, :'shop_a', :'barber'),
  'customers cannot skip the booking rules by writing directly');
select public.book_appointment(:'barber', (:'tomorrow' || ' 10:00+00')::timestamptz);
select pg_temp.expect_error(format($q$select public.book_appointment(%L, %L)$q$, :'barber', (:'tomorrow' || ' 11:00+00')),
  'a customer can have at most 2 upcoming appointments');
select pg_temp.expect((select count(*) from public.my_appointments()) = 2, 'customer sees their 2 appointments');
select pg_temp.expect((select barber_name from public.my_appointments() limit 1) = 'Sam', 'with the barber''s name');
update public.appointments set status = 'done';
select pg_temp.expect((select count(*) from public.appointments where status = 'booked') = 2, 'customer cannot mark appointments done');
select public.cancel_appointment((select appointment_id from public.my_appointments() order by starts_at desc limit 1));
select pg_temp.expect((select count(*) from public.my_appointments() where status = 'cancelled') = 1, 'customer cancels one');
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 5, 'the cancelled time opens up again');

-- Barber sees the bookings and takes tomorrow off
select pg_temp.as_user(:'barber', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.shop_appointments(:'shop_a', now(), now() + interval '3 days')) = 2, 'barber sees the shop''s appointments');
select pg_temp.expect((select customer_name from public.shop_appointments(:'shop_a', now(), now() + interval '3 days') limit 1) = 'Chris', 'with the client''s name');
update public.appointments set status = 'no_show' where status = 'booked';
select pg_temp.expect((select count(*) from public.appointments where status = 'no_show') = 1, 'barber can mark a no-show');
update public.appointments set status = 'booked' where status = 'no_show';
insert into public.barber_days_off (shop_id, barber_id, day) values (:'shop_a', auth.uid(), :'tomorrow');
select pg_temp.expect((select count(*) from public.available_slots(:'shop_a', null, :'tomorrow', 1)) = 0, 'a day off removes all open times');

-- Other shop sees none of it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect((select count(*) from public.shop_appointments(:'shop_a', now(), now() + interval '3 days')) = 0, 'another shop cannot see shop A appointments');
select pg_temp.expect((select count(*) from public.appointments) = 0, 'another shop cannot read shop A appointments directly');
select pg_temp.expect((select count(*) from public.barber_days_off) = 0, 'another shop cannot see shop A days off');
reset role;
\echo ALL SCHEDULING CHECKS PASSED
