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
select id as shop_b from public.shops where name = 'Clip Joint' \gset
set role authenticated;

-- Sam (now owner of shop A) adds a phone and map position; Nia (owner of shop B) hides her shop
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
update public.shops set phone = '(214) 555-0100', latitude = 32.84, longitude = -96.78 where id = :'shop_a';
select pg_temp.expect((select phone from public.shops where id = :'shop_a') = '(214) 555-0100', 'owner saves phone and map position');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1', 'newowner@example.com');
update public.shops set latitude = 32.9, longitude = -96.7, listed = false where id = :'shop_b';
update public.shops set latitude = 0 where id = :'shop_a';
select pg_temp.expect_error($q$update public.shops set latitude = 500 where true$q$, 'impossible map positions are refused');

-- Customer 2 (not linked to any shop) looks at the map
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select pg_temp.expect((select count(*) from public.shop_directory()) = 1, 'the map shows only listed shops with a position');
select pg_temp.expect((select name from public.shop_directory()) = 'Fade Factory', 'shows the shop name');
select pg_temp.expect((select latitude from public.shop_directory()) = 32.84, 'another shop''s owner could not move shop A');
select pg_temp.expect((select phone from public.shop_directory()) = '(214) 555-0100', 'shows the phone number');
select pg_temp.expect((select count(*) from public.shops) = 0, 'the map does not open up the shops table or join codes');
select pg_temp.expect_error(format('select public.join_listed_shop(%L)', :'shop_b'), 'cannot join an unlisted shop from the map');
select pg_temp.expect((select public.join_listed_shop(:'shop_a')) = 'Fade Factory', 'customer joins a listed shop with one tap');
select pg_temp.expect((select shop_id from public.profiles) = :'shop_a', 'the customer is now linked to that shop');
select pg_temp.expect((select is_my_shop from public.shop_directory()), 'the map marks it as their shop');

-- Barbers can't join as customers; signed-out visitors see nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select pg_temp.expect_error(format('select public.join_listed_shop(%L)', :'shop_a'), 'barber accounts cannot join as customers');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.expect_error('select * from public.shop_directory()', 'signed-out visitors cannot see the map');
reset role;
\echo ALL MAP CHECKS PASSED
