-- FOR LOCAL TESTING ONLY. Run after the other test files, on the same test database.
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
select id as appt from public.appointments where customer_id = '00000000-0000-0000-0000-0000000000c1' and status = 'booked' limit 1 \gset
set role authenticated;

-- Chris sends a cut card linked to his booking, with his photo
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
insert into public.cut_cards (id, shop_id, customer_id, appointment_id, cut, hair, has_front_photo, photo_consent_at)
  values ('00000000-0000-0000-0000-0000000ca4d2', :'shop_a', auth.uid(), :'appt', '{"name":"Modern Quiff"}', '{"texture":"wavy"}', true, now());
select pg_temp.expect((select appointment_at from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d2')
  = (select starts_at from public.appointments where id = :'appt'), 'the card takes its time from the booking');
select pg_temp.expect((select barber_id from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d2') = '00000000-0000-0000-0000-0000000000ba',
  'and the booked barber');
select pg_temp.expect((select photos_delete_after::date from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d2')
  = ((select starts_at from public.appointments where id = :'appt') + interval '7 days')::date, 'photos scheduled for deletion 7 days after that booking');

-- Without photos: no permission needed, and none recorded
insert into public.cut_cards (id, shop_id, customer_id, cut, hair)
  values ('00000000-0000-0000-0000-0000000ca4d3', :'shop_a', auth.uid(), '{"name":"Classic Taper"}', '{}');
select pg_temp.expect((select photo_consent_at is null from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d3'), 'a card can be sent without a photo');
select pg_temp.expect_error(format($q$insert into public.cut_cards (shop_id, customer_id, cut, hair, has_front_photo) values (%L, auth.uid(), '{"name":"x"}', '{}', true)$q$, :'shop_a'),
  'a photo cannot be shared without permission');

-- Someone else's booking can't be used
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select pg_temp.expect_error(format($q$insert into public.cut_cards (shop_id, customer_id, appointment_id, cut, hair) values (%L, auth.uid(), %L, '{"name":"x"}', '{}')$q$, :'shop_a', :'appt'),
  'a customer cannot attach someone else''s booking');
select pg_temp.expect((select count(*) from public.cut_cards) = 0, 'Dana cannot see Chris''s cards');

-- Barber works through the cards
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.cut_cards where status = 'new') = 2, 'barber sees 2 new cards');
update public.cut_cards set status = 'seen' where id = '00000000-0000-0000-0000-0000000ca4d2';
update public.cut_cards set status = 'done', barber_notes = 'Took a little more off the sides' where id = '00000000-0000-0000-0000-0000000ca4d2';
select pg_temp.expect((select status from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d2') = 'done', 'barber marks the card done');
select pg_temp.expect_error($q$update public.cut_cards set cut = '{"name":"hacked"}'$q$, 'barbers cannot change the cut the client asked for');

-- Chris can cancel a card he sent
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
delete from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d3';
select pg_temp.expect((select count(*) from public.cut_cards where id = '00000000-0000-0000-0000-0000000ca4d3') = 0, 'customer cancels a card');
reset role;
\echo ALL CUT CARD CHECKS PASSED
