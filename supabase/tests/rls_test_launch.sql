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
-- The server records a recommendation for Chris at shop A (as the server would).
insert into public.recommendations (customer_id, shop_id, answers, result, model, input_tokens, output_tokens, cost_usd)
  values ('00000000-0000-0000-0000-0000000000c1', :'shop_a', '{}', '{}', 'claude-opus-5-5', 6000, 3000, 0.084);
set role authenticated;

-- Push tokens
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select public.register_push_token('ExponentPushToken[chris]', 'ios');
select public.register_push_token('ExponentPushToken[chris]', 'ios');
select pg_temp.expect((select count(*) from public.push_tokens) = 1, 'customer saves their phone for notifications (twice is fine)');
select pg_temp.expect_error($q$insert into public.push_tokens (token, user_id) values ('ExponentPushToken[x]', '00000000-0000-0000-0000-0000000000c2')$q$,
  'cannot register a phone for someone else');
select pg_temp.expect_error($q$select public.register_push_token('not-a-token', 'ios')$q$, 'junk tokens are refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select pg_temp.expect((select count(*) from public.push_tokens) = 0, 'cannot see other people''s phones');
select public.register_push_token('ExponentPushToken[chris]', 'ios');
select pg_temp.expect((select count(*) from public.push_tokens) = 1, 'a phone that signs in to a new account moves to that account');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect((select count(*) from public.push_tokens) = 0, 'and the old account stops getting its notifications');
select public.register_push_token('ExponentPushToken[chris]', 'ios');

-- Birthday
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
update public.profiles set birth_date = '1998-04-12';
select pg_temp.expect((select birth_date from public.profiles) = '1998-04-12', 'customer saves their birthday');
select pg_temp.expect_error($q$update public.profiles set birth_date = current_date - interval '10 years'$q$, 'under-13 birthdays are refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba', 'barber.a@example.com');
select pg_temp.expect((select count(*) from public.profiles where birth_date is not null) = 0, 'barbers cannot see client birthdays');

-- Monthly report
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'owner.a@example.com');
select (public.shop_report(:'shop_a', current_date)) as report_a \gset
select pg_temp.expect((:'report_a'::jsonb ->> 'recommendations')::int = 1, 'owner A report counts recommendations');
select pg_temp.expect((:'report_a'::jsonb ->> 'cut_cards')::int = 1, 'owner A report counts cut cards');
select pg_temp.expect((:'report_a'::jsonb ->> 'bookings_made')::int = 2, 'owner A report counts bookings');
select pg_temp.expect((:'report_a'::jsonb ->> 'new_clients')::int = 1, 'owner A report counts new clients');
select pg_temp.expect(jsonb_array_length(:'report_a'::jsonb -> 'by_barber') = 2, 'report lists each barber');
select pg_temp.expect_error(format('select public.shop_report(%L, current_date)', :'shop_b'), 'owner A cannot see shop B''s report');
select pg_temp.expect_error('select public.admin_overview(current_date)', 'a shop owner is not an admin');
select pg_temp.expect_error($q$insert into public.app_admins (user_id) values (auth.uid())$q$, 'nobody can make themselves admin from the app');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect_error(format('select public.shop_report(%L, current_date)', :'shop_a'), 'customers cannot see shop reports');

-- Admin (added once in the SQL editor)
reset role;
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select (public.admin_overview(current_date)) as overview \gset
select pg_temp.expect((:'overview'::jsonb -> 'totals' ->> 'shops')::int = 2, 'admin sees every shop');
select pg_temp.expect((:'overview'::jsonb -> 'totals' ->> 'ai_cost_month')::numeric = 0.084, 'admin sees AI cost this month');
select pg_temp.expect((select x ->> 'owner_email' from jsonb_array_elements(:'overview'::jsonb -> 'shops') x where x ->> 'name' = 'Fade Factory') = 'owner.a@example.com',
  'admin sees each shop''s owner email');
reset role;
\echo ALL LAUNCH CHECKS PASSED
