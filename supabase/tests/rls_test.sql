-- FOR LOCAL TESTING ONLY. Checks that each person can see exactly what they should.
-- Every check raises an error if the rule is broken.
\set ON_ERROR_STOP on

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com'),
  ('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');

create function pg_temp.as_user(p_id text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email)::text, false);
$$;
create function pg_temp.expect(cond boolean, what text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.expect_error(stmt text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok: % (blocked: %)', what, sqlerrm;
    return;
  end;
  raise exception 'FAILED: % (was allowed)', what;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;

-- Owner A sets up a shop
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Alex');
select public.create_shop('Fade Factory', '1 Main St', 'Alex') as shop_a \gset
insert into public.barber_invites (shop_id, email) values (:'shop_a', 'barber.a@example.com');
select join_code as code_a from public.shops where id = :'shop_a' \gset
select pg_temp.expect((select count(*) from public.barber_invites) = 1, 'owner sees own invite');

-- Owner B sets up a different shop
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Blake');
select public.create_shop('Clip Joint', '', 'Blake') as shop_b \gset
select pg_temp.expect((select count(*) from public.shops) = 1, 'owner B sees only their own shop');
select pg_temp.expect((select count(*) from public.barber_invites) = 0, 'owner B cannot see shop A invites');
select pg_temp.expect_error(format($q$insert into public.barber_invites (shop_id, email) values (%L, 'x@y.com')$q$, :'shop_a'),
  'owner B cannot invite barbers to shop A');
update public.shops set name = 'Hacked' where id = :'shop_a';
select pg_temp.expect_error('select public.regenerate_join_code(''' || :'shop_a' || ''')', 'owner B cannot change shop A code');

-- Barber accepts the invite to shop A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Sam');
select pg_temp.expect((select count(*) from public.my_invites()) = 1, 'barber sees their invite');
select public.accept_invite((select invite_id from public.my_invites()));
select pg_temp.expect((select count(*) from public.shop_members where shop_id = :'shop_a') = 2, 'barber joined shop A');
select pg_temp.expect_error(format($q$update public.shops set join_code = 'AAAAAA' where id = %L$q$, :'shop_a'),
  'barber cannot change the join code column');

-- Customer 1 joins shop A with its code and sends a card
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Chris');
select pg_temp.expect_error('update public.profiles set shop_id = ''' || :'shop_b' || '''', 'customer cannot link to a shop without its code');
select * from public.join_shop(lower(:'code_a'));
select pg_temp.expect((select name from public.shops) = 'Fade Factory', 'customer sees their linked shop (name unchanged by owner B)');
select pg_temp.expect((select count(*) from public.shop_members) = 2, 'customer sees shop A barbers to pick from');
select pg_temp.expect_error('insert into public.recommendations (customer_id, answers, result) values (auth.uid(), ''{}'', ''{}'')',
  'customer cannot add recommendations directly (bypassing limits)');
insert into public.cut_cards (id, shop_id, customer_id, barber_id, cut, hair, customer_note, appointment_at, photo_consent_at)
  values ('00000000-0000-0000-0000-0000000ca4d1', :'shop_a', auth.uid(), '00000000-0000-0000-0000-0000000000ba',
          '{"name":"Textured Crop"}', '{"texture":"wavy"}', 'short on sides', now() + interval '2 days', now());
select pg_temp.expect((select status from public.cut_cards) = 'new', 'card starts as new');
select pg_temp.expect((select customer_first_name from public.cut_cards) = 'Chris', 'first name filled in by database');
select pg_temp.expect((select photos_delete_after::date from public.cut_cards) = (now() + interval '9 days')::date,
  'photos scheduled for deletion 7 days after the appointment');
select pg_temp.expect_error(format($q$insert into public.cut_cards (shop_id, customer_id, cut, hair, photo_consent_at)
  values (%L, auth.uid(), '{"name":"x"}', '{}', now())$q$, :'shop_b'), 'customer cannot send a card to a shop they are not linked to');
update public.cut_cards set status = 'done';
select pg_temp.expect((select status from public.cut_cards) = 'new', 'customer cannot change card status');
insert into storage.objects (bucket_id, name) values
  ('cut-card-photos', :'shop_a' || '/' || auth.uid() || '/00000000-0000-0000-0000-0000000ca4d1/front.jpg');
select pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('cut-card-photos', %L)$q$,
  :'shop_b' || '/' || auth.uid() || '/x/front.jpg'), 'customer cannot upload photos into another shop''s folder');
select pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('cut-card-photos', %L)$q$,
  :'shop_a' || '/00000000-0000-0000-0000-0000000000c2/x/front.jpg'), 'customer cannot upload into another customer''s folder');

-- Customer 2, not linked to any shop
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Dana');
select pg_temp.expect((select count(*) from public.cut_cards) = 0, 'another customer cannot see the card');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'another customer cannot see the photo');
select pg_temp.expect((select count(*) from public.shops) = 0, 'unlinked customer sees no shops');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'customer sees only their own profile');
select pg_temp.expect_error('select public.accept_invite((select id from public.barber_invites limit 1))', 'customer cannot accept someone else''s invite');

-- Barber at shop A sees and updates the card
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.cut_cards) = 1, 'shop A barber sees the card');
select pg_temp.expect((select count(*) from storage.objects) = 1, 'shop A barber sees the photo');
update public.cut_cards set status = 'in_chair', barber_notes = 'Went a little shorter on top';
select pg_temp.expect((select status from public.cut_cards) = 'in_chair', 'barber can change status');
select pg_temp.expect_error('update public.cut_cards set appointment_at = now()', 'barber cannot change the appointment or cut');
select pg_temp.expect((select count(*) from public.barber_invites) = 0, 'barber cannot see the owner''s invite list');

-- Owner B (different shop) sees nothing from shop A
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect((select count(*) from public.cut_cards) = 0, 'shop B cannot see shop A cards');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'shop B cannot see shop A photos');
select pg_temp.expect((select count(*) from public.shop_members) = 1, 'shop B sees only its own team');
update public.cut_cards set status = 'done';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select pg_temp.expect((select status from public.cut_cards) = 'in_chair', 'shop B''s update did nothing');
select pg_temp.expect((select count(*) from public.cut_cards) = 1, 'shop A owner sees the card');

-- Signed-out visitors see nothing
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.expect_error('select * from public.shops', 'signed-out visitors cannot read shops');
select pg_temp.expect_error('select * from public.join_shop(''ABCDEF'')', 'signed-out visitors cannot join shops');
reset role;
\echo ALL SECURITY CHECKS PASSED
