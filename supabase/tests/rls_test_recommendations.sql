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
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1', 'solo@example.com');
insert into public.profiles (id, first_name) values ('00000000-0000-0000-0000-0000000000e1', 'Eli');
-- Chris (linked to shop A) already has 1 recommendation this month from the earlier tests
set role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect((select remaining from public.my_recommendation_allowance()) = 4, 'linked customer: 5 a month, 1 used, 4 left');
select pg_temp.expect_error('select * from public.recommendation_allowance_for(auth.uid())', 'the app cannot call the server-only version');
select pg_temp.expect_error('select * from public.trend_cache', 'customers cannot read the trend cache');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'solo@example.com');
select pg_temp.expect((select remaining from public.my_recommendation_allowance()) = 1, 'no shop: 1 free recommendation');
reset role;
insert into public.recommendations (customer_id, answers, result) values ('00000000-0000-0000-0000-0000000000e1', '{}', '{}');
insert into public.recommendations (customer_id, answers, result, created_at)
  values ('00000000-0000-0000-0000-0000000000c1', '{}', '{}', now() - interval '40 days'),
         ('00000000-0000-0000-0000-0000000000c1', '{}', '{}', now() - interval '41 days');
set role authenticated;
select pg_temp.expect((select remaining from public.my_recommendation_allowance()) = 0, 'no shop: none left after the free one');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'cust1@example.com');
select pg_temp.expect((select remaining from public.my_recommendation_allowance()) = 4, 'last month''s recommendations don''t count against this month');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', 'cust2@example.com');
select pg_temp.expect((select unlimited and remaining = 999 from public.my_recommendation_allowance()), 'admins have no limit');
reset role;
\echo ALL RECOMMENDATION CHECKS PASSED
