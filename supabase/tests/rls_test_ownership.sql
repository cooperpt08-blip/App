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
\set owner_a '00000000-0000-0000-0000-00000000000a'
\set owner_b '00000000-0000-0000-0000-00000000000b'
\set barber '00000000-0000-0000-0000-0000000000ba'
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1', 'newowner@example.com');
set role authenticated;

-- Only the owner can hand over a shop
select pg_temp.as_user(:'barber', 'barber.a@example.com');
select pg_temp.expect_error(format('select public.transfer_shop_to_member(%L, %L)', :'shop_a', :'barber'), 'a barber cannot take the shop for themselves');
select pg_temp.expect_error(format('select public.invite_shop_owner(%L, %L)', :'shop_a', 'x@example.com'), 'a barber cannot invite a new owner');
select pg_temp.as_user(:'owner_b', 'owner.b@example.com');
select pg_temp.expect_error(format('select public.transfer_shop_to_member(%L, %L)', :'shop_a', :'owner_b'), 'another shop''s owner cannot take shop A');
select pg_temp.expect_error(format('select public.transfer_shop_to_member(%L, %L)', :'shop_b', :'barber'), 'cannot hand a shop to someone outside the team');

-- Owner A hands shop A to barber Sam
select pg_temp.as_user(:'owner_a', 'owner.a@example.com');
select public.transfer_shop_to_member(:'shop_a', :'barber');
select pg_temp.expect((select owner_id from public.shops where id = :'shop_a') = :'barber', 'Sam now owns shop A');
select pg_temp.expect((select role from public.shop_members where user_id = :'owner_a') = 'barber', 'the old owner stays on as a barber');
select pg_temp.expect_error(format('select public.invite_shop_owner(%L, %L)', :'shop_a', 'x@example.com'), 'the old owner can no longer hand over the shop');
select pg_temp.as_user(:'barber', 'barber.a@example.com');
select pg_temp.expect(public.is_shop_owner(:'shop_a'), 'Sam has owner powers');
select pg_temp.expect((select count(*) from public.cut_cards) = 1, 'Sam still sees the shop''s cut cards');

-- Owner B invites a new owner by email, then deletes their account
select pg_temp.as_user(:'owner_b', 'owner.b@example.com');
select pg_temp.expect_error(format('select public.invite_shop_owner(%L, %L)', :'shop_b', 'OWNER.B@example.com'), 'cannot invite yourself');
select public.invite_shop_owner(:'shop_b', 'NewOwner@Example.com');
select pg_temp.expect((select email from public.shop_owner_invites) = 'newowner@example.com', 'owner B sees the pending hand-over');
select pg_temp.as_user(:'barber', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.shop_owner_invites) = 0, 'other shops cannot see the hand-over');
select pg_temp.expect_error(format('select public.accept_owner_invite(%L)', :'shop_b'), 'someone with a different email cannot accept it');

reset role;
delete from auth.users where id = :'owner_b';  -- what the delete-account function does
select pg_temp.expect((select count(*) from public.shops where id = :'shop_b') = 1, 'deleting the owner''s account keeps the shop');
select pg_temp.expect((select owner_id is null from public.shops where id = :'shop_b'), 'the shop waits for its new owner');
set role authenticated;

-- The new owner signs up with that email and accepts
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1', 'newowner@example.com');
insert into public.profiles (id, first_name) values (auth.uid(), 'Nia');
select pg_temp.expect((select shop_name from public.my_owner_invites()) = 'Clip Joint', 'the new owner sees the invite');
select public.accept_owner_invite(:'shop_b');
select pg_temp.expect((select owner_id from public.shops where id = :'shop_b') = auth.uid(), 'Nia now owns Clip Joint');
select pg_temp.expect(public.is_shop_owner(:'shop_b'), 'Nia has owner powers');
select pg_temp.expect((select count(*) from public.my_owner_invites()) = 0, 'the invite is used up');
reset role;
\echo ALL OWNERSHIP CHECKS PASSED
