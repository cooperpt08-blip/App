-- Shape Up: notifications, reminders, monthly reports, admin view
-- ------------------------------------------------------------------
-- Run this AFTER the earlier files (SQL Editor -> New query -> paste -> Run, once).
--
-- Adds:
--   * push_tokens: which phones to send notifications to, per person
--   * appointments.reminder_sent_at: so each customer gets one day-before reminder
--   * recommendations: token counts and cost, so you can see AI spending
--   * app_admins: who can open the admin view (you)
--   * shop_report(): the monthly numbers a shop owner sees
--   * admin_overview(): every shop, usage and AI costs, for admins only
--   * profiles.birth_date: a customer's birthday (private: only they and the
--     recommendation server use it; barbers never see it)
-- ------------------------------------------------------------------

-- ============ Birthday ============
-- Hair changes with age (thickness, density, hairline), so age helps tailor
-- recommendations. It also confirms people are old enough to use the app.
alter table public.profiles add column birth_date date check (birth_date >= '1900-01-01');
grant insert (birth_date) on public.profiles to authenticated;
grant update (birth_date) on public.profiles to authenticated;

create function public.check_birth_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '13 years')::date then
    raise exception 'You must be at least 13 to use Shape Up.';
  end if;
  return new;
end;
$$;
create trigger profiles_birth_date before insert or update of birth_date on public.profiles
  for each row execute function public.check_birth_date();

-- ============ Push notifications ============

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default '' check (platform in ('', 'ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;
create policy "push tokens: own" on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy "push tokens: remove own" on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- The app calls this after sign-in. If the phone was last used by another account,
-- it moves to the person signed in now, so notifications never go to the wrong person.
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then raise exception 'Not a valid phone token'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
    values (p_token, auth.uid(), coalesce(nullif(p_platform, 'web'), ''), now())
    on conflict (token) do update
      set user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at;
end;
$$;
revoke execute on function public.register_push_token from public, anon;
grant execute on function public.register_push_token to authenticated;

-- One reminder per appointment.
alter table public.appointments add column reminder_sent_at timestamptz;

-- ============ AI cost tracking ============
-- Filled in by the server when it gets a recommendation from Claude.
alter table public.recommendations
  add column model text,
  add column input_tokens integer not null default 0,
  add column output_tokens integer not null default 0,
  add column cost_usd numeric(10, 5) not null default 0;

-- ============ Admins ============

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
-- Nobody can add admins from the app. Add yourself once in the SQL Editor (see README).

create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

-- ============ Monthly report for a shop ============
-- p_month: any date in the month you want, e.g. '2026-10-01'. Staff of the shop only.
create function public.shop_report(p_shop uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := public.shop_timezone(p_shop);
  month_start timestamptz := (date_trunc('month', p_month)::timestamp) at time zone tz;
  month_end timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp) at time zone tz;
begin
  if not public.is_shop_staff(p_shop) then raise exception 'Only this shop can see its report'; end if;
  return jsonb_build_object(
    'new_clients', (
      select count(distinct c.id) from (
        select p.id from public.profiles p
          where p.shop_id = p_shop and p.shop_joined_at >= month_start and p.shop_joined_at < month_end
        union
        select a.customer_id from public.shop_client_access a
          where a.shop_id = p_shop and a.granted_at >= month_start and a.granted_at < month_end
      ) c),
    'total_clients', (select count(*) from public.profiles p where p.shop_id = p_shop),
    'cut_cards', (select count(*) from public.cut_cards c
                  where c.shop_id = p_shop and c.created_at >= month_start and c.created_at < month_end),
    'recommendations', (select count(*) from public.recommendations r
                        where r.shop_id = p_shop and r.created_at >= month_start and r.created_at < month_end),
    'bookings_made', (select count(*) from public.appointments a
                      where a.shop_id = p_shop and a.created_at >= month_start and a.created_at < month_end),
    'appointments_done', (select count(*) from public.appointments a
                          where a.shop_id = p_shop and a.status = 'done'
                            and a.starts_at >= month_start and a.starts_at < month_end),
    'no_shows', (select count(*) from public.appointments a
                 where a.shop_id = p_shop and a.status = 'no_show'
                   and a.starts_at >= month_start and a.starts_at < month_end),
    'cancellations', (select count(*) from public.appointments a
                      where a.shop_id = p_shop and a.status = 'cancelled'
                        and a.starts_at >= month_start and a.starts_at < month_end),
    'by_barber', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.display_name, 'done', x.done) order by x.done desc)
      from (
        select m.display_name, count(a.id) filter (where a.status = 'done') as done
        from public.shop_members m
        left join public.appointments a on a.barber_id = m.user_id and a.shop_id = p_shop
          and a.starts_at >= month_start and a.starts_at < month_end
        where m.shop_id = p_shop
        group by m.display_name
      ) x), '[]'::jsonb)
  );
end;
$$;

-- ============ Admin overview ============
-- Everything you need to run the business, in one call. Admins only.
create function public.admin_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  month_start timestamptz := date_trunc('month', p_month)::timestamptz;
  month_end timestamptz := (date_trunc('month', p_month) + interval '1 month')::timestamptz;
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'shops', (select count(*) from public.shops),
      'barbers', (select count(*) from public.shop_members),
      'customers', (select count(*) from public.profiles p where p.kind = 'customer'),
      'customers_linked', (select count(*) from public.profiles p where p.kind = 'customer' and p.shop_id is not null),
      'new_accounts_month', (select count(*) from public.profiles p where p.created_at >= month_start and p.created_at < month_end),
      'recommendations_month', (select count(*) from public.recommendations r where r.created_at >= month_start and r.created_at < month_end),
      'ai_cost_month', (select coalesce(sum(r.cost_usd), 0) from public.recommendations r where r.created_at >= month_start and r.created_at < month_end),
      'ai_cost_all_time', (select coalesce(sum(r.cost_usd), 0) from public.recommendations r),
      'cut_cards_month', (select count(*) from public.cut_cards c where c.created_at >= month_start and c.created_at < month_end),
      'bookings_month', (select count(*) from public.appointments a where a.created_at >= month_start and a.created_at < month_end)
    ),
    'shops', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.recommendations_month desc, x.name)
      from (
        select
          s.id, s.name, s.address, s.created_at,
          (select u.email from auth.users u where u.id = s.owner_id) as owner_email,
          (select count(*) from public.shop_members m where m.shop_id = s.id) as team,
          (select count(*) from public.profiles p where p.shop_id = s.id) as clients,
          (select count(*) from public.recommendations r
            where r.shop_id = s.id and r.created_at >= month_start and r.created_at < month_end) as recommendations_month,
          (select coalesce(sum(r.cost_usd), 0) from public.recommendations r
            where r.shop_id = s.id and r.created_at >= month_start and r.created_at < month_end) as ai_cost_month,
          (select count(*) from public.cut_cards c
            where c.shop_id = s.id and c.created_at >= month_start and c.created_at < month_end) as cut_cards_month,
          (select count(*) from public.appointments a
            where a.shop_id = s.id and a.created_at >= month_start and a.created_at < month_end) as bookings_month
        from public.shops s
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.is_app_admin, public.shop_report, public.admin_overview from public, anon;
grant execute on function public.is_app_admin, public.shop_report, public.admin_overview to authenticated;
