-- FOR LOCAL TESTING ONLY. Run after rls_test.sql, on the same test database.
-- Checks the Clients tab, profile photos, and sharing a cut card with a new shop.
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
set role authenticated;

-- Customer 1 (linked to shop A) adds a profile photo
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
insert into storage.objects (bucket_id, name) values ('profile-photos', auth.uid() || '/avatar.jpg');
update public.profiles set avatar_updated_at = now();
select pg_temp.expect((select avatar_updated_at is not null from public.profiles), 'customer can set their photo date');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('profile-photos', '00000000-0000-0000-0000-0000000000c2/avatar.jpg')$q$,
  'customer cannot upload someone else''s profile photo');
select pg_temp.expect((select count(*) from public.client_notes) = 0, 'customer cannot read barbers'' notes');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_a')) = 0, 'customer cannot list shop A clients');
select pg_temp.expect_error('select public.redeem_share_code(''ABCDEFGH'')', 'customer cannot redeem a client code');

-- Customer 2 (not linked to any shop) adds a photo
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
insert into storage.objects (bucket_id, name) values ('profile-photos', auth.uid() || '/avatar.jpg');

-- Barber at shop A: Clients tab
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_a')) = 1, 'barber A sees exactly one client');
select pg_temp.expect((select first_name from public.shop_clients(:'shop_a')) = 'Chris', 'client first name shown');
select pg_temp.expect((select usual_cut from public.shop_clients(:'shop_a')) = 'Textured Crop', 'usual cut falls back to latest cut card');
select pg_temp.expect((select mine from public.shop_clients(:'shop_a')), 'client counts as mine (picked me on a card)');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'profile-photos') = 1, 'barber A sees only their client''s photo');
insert into public.client_notes (shop_id, customer_id, usual_cut)
  values (:'shop_a', '00000000-0000-0000-0000-0000000000c1', '#1 skin fade, 2 inches on top')
  on conflict (shop_id, customer_id) do update set usual_cut = excluded.usual_cut;
insert into public.client_notes (shop_id, customer_id, usual_cut)
  values (:'shop_a', '00000000-0000-0000-0000-0000000000c1', '#2 skin fade, 2 inches on top')
  on conflict (shop_id, customer_id) do update set usual_cut = excluded.usual_cut;
select pg_temp.expect((select usual_cut from public.shop_clients(:'shop_a')) = '#2 skin fade, 2 inches on top', 'barber''s note (saved twice) replaces the fallback');
select pg_temp.expect((select count(*) from public.client_cut_cards(:'shop_a', '00000000-0000-0000-0000-0000000000c1')) = 1, 'barber sees the client''s cut cards');
select pg_temp.expect((select status from public.client_cut_cards(:'shop_a', '00000000-0000-0000-0000-0000000000c1')) = 'in_chair', 'own shop card shows its status');
select pg_temp.expect_error(format($q$insert into public.client_notes (shop_id, customer_id, usual_cut) values (%L, '00000000-0000-0000-0000-0000000000c2', 'x')$q$, :'shop_a'),
  'barber cannot add notes about someone who is not their client');
select pg_temp.expect_error('select public.redeem_share_code(''ZZZZZZZZ'')', 'a made-up code does nothing');

-- Owner B (other shop) before any sharing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_a')) = 0, 'shop B cannot list shop A clients');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_b')) = 0, 'shop B has no clients yet');
select pg_temp.expect((select count(*) from public.client_cut_cards(:'shop_b', '00000000-0000-0000-0000-0000000000c1')) = 0, 'shop B cannot see Chris''s cut cards yet');
select pg_temp.expect((select count(*) from public.client_notes) = 0, 'shop B cannot read shop A notes');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'profile-photos') = 0, 'shop B cannot see any client photos');
select pg_temp.expect_error(format($q$insert into public.client_notes (shop_id, customer_id, usual_cut) values (%L, '00000000-0000-0000-0000-0000000000c1', 'x')$q$, :'shop_a'),
  'shop B cannot write notes for shop A');
update public.client_notes set usual_cut = 'hacked';

-- Chris visits shop B and shows his code
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select code as chris_code from public.create_share_code() \gset
select pg_temp.expect_error('select * from public.client_share_codes', 'nobody can read share codes directly');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect((select first_name from public.redeem_share_code(lower(:'chris_code'))) = 'Chris', 'shop B scans Chris''s code');
select pg_temp.expect_error(format('select public.redeem_share_code(%L)', :'chris_code'), 'a code only works once');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_b')) = 1, 'Chris now appears in shop B''s clients');
select pg_temp.expect((select shared from public.shop_clients(:'shop_b')), 'shop B sees Chris as shared (not linked)');
select pg_temp.expect((select usual_cut from public.shop_clients(:'shop_b')) = 'Textured Crop', 'shop B sees Chris''s latest cut, not shop A''s private note');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'profile-photos') = 1, 'shop B can now see Chris''s profile photo');
select pg_temp.expect((select cut ->> 'name' from public.client_cut_cards(:'shop_b', '00000000-0000-0000-0000-0000000000c1')) = 'Textured Crop', 'shop B sees the shared cut card');
select pg_temp.expect((select not from_this_shop and status is null and barber_name is null and customer_note = ''
                       from public.client_cut_cards(:'shop_b', '00000000-0000-0000-0000-0000000000c1')),
  'shop B does not see shop A''s status, barber, or the customer''s note to shop A');
select pg_temp.expect((select count(*) from public.cut_cards) = 0, 'shop B still cannot open shop A''s card or photos directly');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'cut-card-photos') = 0, 'shop B cannot see appointment photos');
insert into public.client_notes (shop_id, customer_id, usual_cut) values (:'shop_b', '00000000-0000-0000-0000-0000000000c1', 'Same as last time');
select pg_temp.expect((select count(*) from public.client_notes) = 1, 'shop B keeps its own note about Chris');

-- Chris sees who has access and removes shop B
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect((select shop_name from public.my_shared_shops()) = 'Clip Joint', 'Chris sees that Clip Joint has access');
delete from public.shop_client_access where shop_id = :'shop_b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'owner.b@example.com');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_b')) = 0, 'after Chris removes access, shop B no longer sees him');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'profile-photos') = 0, 'and no longer sees his photo');

-- Shop A is unaffected
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select pg_temp.expect((select usual_cut from public.client_notes where shop_id = :'shop_a') = '#2 skin fade, 2 inches on top',
  'shop B''s edit did nothing; shop A owner sees their note');
select pg_temp.expect((select count(*) from public.shop_clients(:'shop_a')) = 1, 'shop A still sees Chris');
reset role;
\echo ALL CLIENT CHECKS PASSED
