begin;

alter table public.native_push_subscriptions add column timezone text;
alter table public.notification_events drop constraint notification_events_category_check;
alter table public.notification_events add constraint notification_events_category_check
  check (category in ('group_attention', 'direct_checkin', 'personal_reminder', 'preplot'));
alter table public.notification_events drop constraint notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check
  check (event_type in ('group_attention', 'direct_checkin', 'personal_pace', 'planned_end', 'periodic_water', 'preplot'));

create table private.preplot_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  sunday_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00'
);
create table private.preplot_holidays (
  day date primary key,
  campaign text not null check (campaign ~ '^[a-z_]+$'),
  mode text not null check (mode in ('celebrate', 'suppress')),
  title text not null,
  body text not null,
  source_url text not null
);
create table private.preplot_calendar_coverage (
  year integer primary key,
  reviewed_through date not null
);
create table private.preplot_campaigns (
  event_id uuid primary key references public.notification_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign text not null,
  local_day date not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  night_started_at timestamptz,
  attributed_night_id uuid references public.nights(id) on delete set null,
  suppressed_at timestamptz,
  unique (user_id, local_day, campaign)
);
create index preplot_campaigns_user_window_idx on private.preplot_campaigns(user_id, starts_at desc);
create index preplot_campaigns_night_idx on private.preplot_campaigns(attributed_night_id) where attributed_night_id is not null;
create table private.preplot_app_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid not null,
  bucket timestamptz not null,
  timezone text not null,
  primary key (user_id, installation_id, bucket)
);
alter table private.preplot_preferences enable row level security;
alter table private.preplot_holidays enable row level security;
alter table private.preplot_calendar_coverage enable row level security;
alter table private.preplot_campaigns enable row level security;
alter table private.preplot_app_sessions enable row level security;
revoke all on private.preplot_preferences, private.preplot_holidays, private.preplot_calendar_coverage,
  private.preplot_campaigns, private.preplot_app_sessions from public, anon, authenticated;
grant all on private.preplot_preferences, private.preplot_holidays, private.preplot_calendar_coverage,
  private.preplot_campaigns, private.preplot_app_sessions to service_role;

-- Official 2026 calendar. Tentative Eid dates suppress BOTH the day and eve;
-- operators must update these rows when the official moon-sighting dates change.
insert into private.preplot_calendar_coverage values (2026, '2026-12-31');
-- January 1 is a fixed holiday; the rest of 2027 awaits a reviewed calendar.
insert into private.preplot_calendar_coverage values (2027, '2027-01-01');
insert into private.preplot_holidays(day, campaign, mode, title, body, source_url)
select day::date, campaign, mode, title, body, 'https://arusha.mofa.go.ug/basic-page/public-holidays'
from (values
 ('2026-01-01', 'new_year', 'celebrate', 'How are we feeling? 😭', 'New year, same rule: if there''s another plot today, make a plan first.'),
 ('2026-01-15', 'election', 'suppress', '', ''),
 ('2026-01-16', 'election', 'suppress', '', ''),
 ('2026-01-26', 'liberation', 'celebrate', 'Holiday plans? 🇺🇬', 'Heading out today? Set up your DWD Night before you leave.'),
 ('2026-02-16', 'janani_luwum', 'suppress', '', ''),
 ('2026-03-08', 'womens_day', 'celebrate', 'Women''s Day plans? 💐', 'If you''re celebrating tonight, start your Night before you leave.'),
 ('2026-03-20', 'eid_al_fitr', 'suppress', '', ''),
 ('2026-04-03', 'good_friday', 'suppress', '', ''),
 ('2026-04-05', 'easter_sunday', 'suppress', '', ''),
 ('2026-04-06', 'easter_monday', 'celebrate', 'Holiday plans? 👀', 'Going somewhere this evening? Start a DWD Night before you head out.'),
 ('2026-05-01', 'labour_day', 'celebrate', 'You literally earned this one 😭', 'Labour Day plot? Set up your Night before heading out.'),
 ('2026-05-27', 'eid_al_adha', 'suppress', '', ''),
 ('2026-06-03', 'martyrs_day', 'suppress', '', ''),
 ('2026-06-09', 'heroes_day', 'celebrate', 'Holiday plans? 👀', 'Going somewhere this evening? Start a DWD Night before you head out.'),
 ('2026-10-09', 'independence', 'celebrate', 'Happy Independence Day 🇺🇬', 'Ofuluma leero? Start your Night before Kampala starts doing Kampala things.'),
 ('2026-12-25', 'christmas', 'celebrate', 'Merry Christmas 🎄', 'If Christmas has turned into a plot, you know what to do.'),
 ('2026-12-26', 'boxing_day', 'celebrate', 'Round two? 😭', 'Boxing Day plans? Set your Night before today''s plot gets serious.')
) as h(day, campaign, mode, title, body);
insert into private.preplot_holidays values ('2027-01-01', 'new_year', 'celebrate', 'How are we feeling? 😭',
  'New year, same rule: if there''s another plot today, make a plan first.', 'https://arusha.mofa.go.ug/basic-page/public-holidays');

create function private.preplot_windows(p_day date)
returns table(campaign text, send_time time, end_time time, backup boolean, titles text[], bodies text[])
language plpgsql stable security invoker set search_path = '' as $$
declare v_holiday private.preplot_holidays; v_eve private.preplot_holidays;
begin
  -- Fail closed outside reviewed calendar coverage, including future Eid dates.
  if not exists (select 1 from private.preplot_calendar_coverage c
    where c.year = extract(year from p_day) and c.reviewed_through >= p_day) then return; end if;
  select * into v_holiday from private.preplot_holidays where day = p_day;
  select * into v_eve from private.preplot_holidays where day = p_day + 1;
  if v_holiday.mode = 'suppress' or v_eve.mode = 'suppress' then return; end if;
  if to_char(p_day, 'MM-DD') = '12-31' then
    return query select 'nye_preplot', '15:00'::time, '16:00'::time, false,
      array['Tonight is NOT the night to freestyle 😭'], array['Set your Night, pace and reminders before the countdown starts.'];
    return query select 'nye_backup', '19:00'::time, '19:30'::time, true,
      array['See you on the other side 🥂'], array['Going out tonight? Give future-you one favour: start your DWD Night first.'];
  elsif v_holiday.day is not null then
    return query select v_holiday.campaign || '_holiday', '15:00'::time, '16:00'::time, false,
      case when v_holiday.campaign = 'independence' then array[v_holiday.title,
        'Uganda at ' || (extract(year from p_day)::integer - 1962) || ' 🇺🇬🥳'] else array[v_holiday.title] end,
      case when v_holiday.campaign = 'independence' then array[v_holiday.body,
        'If today''s celebrations include a night out, make the plan before the vibes.'] else array[v_holiday.body] end;
  elsif v_eve.day is not null then
    return query select v_eve.campaign || '_eve', '17:15'::time, '18:00'::time, false,
      array[case v_eve.campaign when 'independence' then 'Long weekend loading 🇺🇬'
        when 'christmas' then 'Christmas plot loading 🎄' else 'Holiday tomorrow 👀' end],
      array['Got plans tomorrow? Set up your DWD Night before the plot begins.'];
  elsif extract(isodow from p_day) = 5 then
    return query select 'friday_preplot', '17:15'::time, '17:30'::time, false,
      array['What''s the plot? 👀', 'Ofuluma leero? 👀', 'Clocked out? 🍸'],
      array['Friday is looking suspiciously active. Starting a night? Set it up on DWD first.',
        'If there''s a plot tonight, DWD wants to know before the first drink does.',
        'Work is done. If the night is just getting started, make a plan first.'];
    return query select 'friday_backup', '19:30'::time, '19:45'::time, true,
      array['Kampala is waking up 👀', 'Don''t freestyle the night 😭'],
      array['Going out tonight? Start your DWD night before things get hectic.', 'Set your drinks, pace and reminders before you head out.'];
  elsif extract(isodow from p_day) = 6 then
    return query select 'saturday_preplot', '15:30'::time, '16:00'::time, false,
      array['So… what''s happening tonight?', 'Plot loading… 🍻', 'Tuli wa leero? 👀', 'Have fun. Keep track. 🤝'],
      array['If the group chat has started moving, this is your sign to set up DWD.',
        'Start your Night now. Future-you may appreciate the planning.',
        'Wherever the plot takes you, set up your night before you go.', 'Set a Night, pace yourself, and nywa amazzi agamala too.'];
    return query select 'saturday_backup', '19:15'::time, '19:30'::time, true,
      array['Before you leave 👀', 'Keys. Wallet. Phone. DWD.'],
      array['Two minutes now saves you trying to remember everything later. Start your Night.',
        'Heading out? Set your night before you disappear into the plot.'];
  elsif extract(isodow from p_day) = 7 then
    return query select 'sunday_preplot', '16:00'::time, '17:00'::time, false,
      array['Sunday plot? 👀', 'One last plot?'],
      array['If today unexpectedly became an outside day, we''ve got you.',
        'Going somewhere this evening? Start a DWD Night before you head out.'];
  end if;
end $$;

create function private.preplot_user_eligible(p_user_id uuid, p_now timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((select enabled from private.preplot_preferences where user_id = p_user_id), true)
    and coalesce((select timezone in ('Africa/Kampala', 'Africa/Nairobi')
      from public.native_push_subscriptions s where s.user_id = p_user_id and s.disabled_at is null
        and exists (select 1 from auth.sessions a where a.id = s.session_id and a.user_id = s.user_id)
      order by s.updated_at desc, s.id limit 1), false)
    and not exists (select 1 from public.account_deletions where user_id = p_user_id)
    and not exists (select 1 from public.notification_preferences where user_id = p_user_id and reminders_muted_until > p_now)
    and not exists (select 1 from public.night_members m join public.nights n on n.id = m.night_id
      where m.user_id = p_user_id and ((m.left_at is null and n.status = 'active')
        or (greatest(n.starts_at, m.joined_at) between p_now - interval '12 hours' and p_now)))
    and not exists (select 1 from private.preplot_preferences p where p.user_id = p_user_id
      and case when p.quiet_start = p.quiet_end then true
        when p.quiet_start < p.quiet_end then (p_now at time zone 'Africa/Kampala')::time >= p.quiet_start
          and (p_now at time zone 'Africa/Kampala')::time < p.quiet_end
        else (p_now at time zone 'Africa/Kampala')::time >= p.quiet_start
          or (p_now at time zone 'Africa/Kampala')::time < p.quiet_end end)
    and (exists (select 1 from private.preplot_preferences where user_id = p_user_id)
      or (p_now at time zone 'Africa/Kampala')::time between '08:00'::time and '21:59:59'::time);
$$;

create function private.create_due_preplot_events(p_now timestamptz default clock_timestamp())
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_day date := (p_now at time zone 'Africa/Kampala')::date;
  v_week date; v_window record; v_user uuid; v_event uuid; v_choice integer; v_count integer := 0;
begin
  -- Only the internal worker can call this; a lock serializes concurrent Cron ticks.
  if not pg_try_advisory_xact_lock(61006072232) then return 0; end if;
  v_week := v_day - ((extract(isodow from v_day)::integer + 2) % 7);
  for v_window in select * from private.preplot_windows(v_day)
    where (p_now at time zone 'Africa/Kampala')::time >= send_time
      and (p_now at time zone 'Africa/Kampala')::time < end_time
  loop
    for v_user in select distinct s.user_id from public.native_push_subscriptions s
      where s.disabled_at is null and s.timezone in ('Africa/Kampala', 'Africa/Nairobi')
        and private.preplot_user_eligible(s.user_id, p_now)
    loop
      if v_window.campaign = 'sunday_preplot' and not coalesce((select sunday_enabled
        from private.preplot_preferences where user_id = v_user), false) then continue; end if;
      if exists (select 1 from private.preplot_campaigns where user_id = v_user
          and local_day = v_day and campaign = v_window.campaign)
        or (select count(*) from private.preplot_campaigns where user_id = v_user and local_day >= v_week and local_day < v_week + 7) >= 2
        or exists (select 1 from private.preplot_campaigns c join public.notification_events e on e.id = c.event_id
          where c.user_id = v_user and c.local_day >= v_week and c.local_day < v_week + 7
            and (c.opened_at is not null or c.night_started_at is not null or e.acknowledged_at is not null))
        or exists (select 1 from private.preplot_campaigns where user_id = v_user
          and starts_at > p_now - interval '2 hours' and starts_at <= p_now)
        then continue; end if;
      -- A backup is allowed only after an actually accepted, unopened primary.
      if v_window.backup and not exists (select 1 from private.preplot_campaigns c
        where c.user_id = v_user and c.local_day = v_day and c.campaign not like '%_backup'
          and c.accepted_at is not null and c.opened_at is null and c.suppressed_at is null) then continue; end if;
      v_event := extensions.gen_random_uuid();
      v_choice := 1 + (abs(hashtextextended(v_user::text || v_day::text || v_window.campaign, 0) % cardinality(v_window.titles)))::integer;
      insert into public.notification_events(id, event_key, recipient_user_id, category, event_type, title, body, deep_link, created_at, expires_at)
      values(v_event, 'preplot:' || v_day || ':' || v_window.campaign, v_user, 'preplot', 'preplot',
        v_window.titles[v_choice], v_window.bodies[v_choice],
        '/night/new?source=push&campaign=' || v_window.campaign || '&notificationId=' || v_event,
        p_now, (v_day + v_window.end_time) at time zone 'Africa/Kampala');
      insert into private.preplot_campaigns(event_id, user_id, campaign, local_day, starts_at, expires_at)
      values(v_event, v_user, v_window.campaign, v_day,
        (v_day + v_window.send_time) at time zone 'Africa/Kampala', (v_day + v_window.end_time) at time zone 'Africa/Kampala');
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;

create function public.get_preplot_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  return jsonb_build_object('enabled', coalesce((select enabled from private.preplot_preferences where user_id = auth.uid()), true),
    'sundayEnabled', coalesce((select sunday_enabled from private.preplot_preferences where user_id = auth.uid()), false));
end $$;
create function public.update_preplot_preferences(p_enabled boolean, p_sunday_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  insert into private.preplot_preferences(user_id, enabled, sunday_enabled) values(auth.uid(), p_enabled, p_sunday_enabled)
    on conflict (user_id) do update set enabled = excluded.enabled, sunday_enabled = excluded.sunday_enabled;
  return public.get_preplot_preferences();
end $$;
create function public.update_native_push_context(p_installation_id uuid, p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session uuid := (auth.jwt()->>'session_id')::uuid;
begin
  if v_actor is null or not exists (select 1 from auth.sessions where id = v_session and user_id = v_actor) then
    raise exception 'Active sign-in required.' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone.' using errcode = '22023'; end if;
  update public.native_push_subscriptions set timezone = p_timezone, updated_at = clock_timestamp()
    where installation_id = p_installation_id and user_id = v_actor and session_id = v_session and disabled_at is null;
  if not found then raise exception 'Device not found.' using errcode = '42501'; end if;
  insert into private.preplot_app_sessions(user_id, installation_id, bucket, timezone)
    values(v_actor, p_installation_id, date_bin(interval '15 minutes', clock_timestamp(), '2026-01-01'::timestamptz), p_timezone)
    on conflict do nothing;
end $$;
create function public.record_preplot_open(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update private.preplot_campaigns set opened_at = coalesce(opened_at, clock_timestamp())
    where event_id = p_event_id and user_id = auth.uid();
  if not found then raise exception 'Notification not found.' using errcode = '42501'; end if;
end $$;

-- Keep the existing eligibility rule intact for reminders and check-ins.
alter function private.notification_is_current(public.notification_events) rename to notification_is_current_before_preplot;
create function private.notification_is_current(e public.notification_events)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when e.event_type <> 'preplot' then private.notification_is_current_before_preplot(e)
    else e.expires_at > clock_timestamp() and private.preplot_user_eligible(e.recipient_user_id, clock_timestamp())
      and exists (select 1 from private.preplot_campaigns c where c.event_id = e.id and c.suppressed_at is null) end;
$$;
revoke all on function private.notification_is_current(public.notification_events) from public, anon, authenticated;
alter function private.native_notification_current(public.notification_events, public.native_push_subscriptions)
  rename to native_notification_current_before_preplot;
create function private.native_notification_current(p_event public.notification_events, p_subscription public.native_push_subscriptions)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_event.event_type <> 'preplot' then private.native_notification_current_before_preplot(p_event, p_subscription)
    else p_event.acknowledged_at is null and p_event.expires_at > clock_timestamp()
      and p_subscription.user_id = p_event.recipient_user_id and p_subscription.disabled_at is null
      and p_subscription.timezone in ('Africa/Kampala', 'Africa/Nairobi')
      and exists (select 1 from auth.sessions where id = p_subscription.session_id and user_id = p_subscription.user_id)
      and private.preplot_user_eligible(p_event.recipient_user_id, clock_timestamp())
      and exists (select 1 from private.preplot_campaigns c where c.event_id = p_event.id and c.suppressed_at is null
        and c.opened_at is null and c.starts_at <= clock_timestamp()
        and (c.campaign <> 'sunday_preplot' or coalesce((select sunday_enabled from private.preplot_preferences
          where user_id = c.user_id), false))
        and not exists (select 1 from private.preplot_campaigns earlier join public.notification_events e on e.id = earlier.event_id
          where earlier.user_id = c.user_id and earlier.event_id <> c.event_id
            and earlier.local_day >= c.local_day - ((extract(isodow from c.local_day)::integer + 2) % 7)
            and earlier.starts_at <= c.starts_at
            and (earlier.opened_at is not null or earlier.night_started_at is not null or e.acknowledged_at is not null))) end;
$$;

create function public.recheck_native_notification_job(p_delivery_id uuid, p_attempt integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_current boolean;
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  select private.native_notification_current(e, s) into v_current from public.native_notification_deliveries d
    join public.notification_events e on e.id = d.event_id join public.native_push_subscriptions s on s.id = d.subscription_id
    where d.id = p_delivery_id and d.attempts = p_attempt and d.status = 'sending';
  if coalesce(v_current, false) then return true; end if;
  update public.native_notification_deliveries set status = 'discarded'
    where id = p_delivery_id and attempts = p_attempt and status = 'sending';
  return false;
end $$;

create function private.track_preplot_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' then
    update private.preplot_campaigns set accepted_at = coalesce(accepted_at, clock_timestamp()) where event_id = new.event_id;
  elsif new.status = 'delivered' then
    update private.preplot_campaigns set delivered_at = coalesce(delivered_at, clock_timestamp()) where event_id = new.event_id;
  end if;
  return new;
end $$;
create trigger track_preplot_delivery after update of status on public.native_notification_deliveries
  for each row execute function private.track_preplot_delivery();

create function private.suppress_preplot_on_night()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  if new.user_id is null or new.left_at is not null or not exists (
    select 1 from public.nights where id = new.night_id and status = 'active') then return new; end if;
  update private.preplot_campaigns set night_started_at = coalesce(night_started_at, v_now), attributed_night_id = new.night_id
    where event_id = (select event_id from private.preplot_campaigns where user_id = new.user_id
      and accepted_at >= v_now - interval '12 hours' and accepted_at <= v_now and night_started_at is null
      order by coalesce(opened_at, accepted_at) desc limit 1);
  update private.preplot_campaigns set suppressed_at = coalesce(suppressed_at, v_now)
    where user_id = new.user_id and expires_at > v_now;
  update public.native_notification_deliveries d set status = 'discarded'
    from private.preplot_campaigns c where c.event_id = d.event_id and c.user_id = new.user_id
      and d.status in ('queued', 'sending', 'failed');
  return new;
end $$;
create trigger suppress_preplot_on_night after insert or update of left_at on public.night_members
  for each row execute function private.suppress_preplot_on_night();

revoke all on function private.preplot_windows(date), private.preplot_user_eligible(uuid,timestamptz),
  private.create_due_preplot_events(timestamptz), private.track_preplot_delivery(), private.suppress_preplot_on_night(),
  private.native_notification_current(public.notification_events, public.native_push_subscriptions) from public, anon, authenticated;
revoke all on function public.get_preplot_preferences(), public.update_preplot_preferences(boolean,boolean),
  public.update_native_push_context(uuid,text), public.record_preplot_open(uuid) from public, anon;
grant execute on function public.get_preplot_preferences(), public.update_preplot_preferences(boolean,boolean),
  public.update_native_push_context(uuid,text), public.record_preplot_open(uuid) to authenticated;
revoke all on function public.recheck_native_notification_job(uuid,integer) from public, anon, authenticated;
grant execute on function public.recheck_native_notification_job(uuid,integer) to service_role;

create or replace function public.claim_native_notification_jobs(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job record; v_result jsonb := '[]';
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  perform private.create_due_notification_events();
  perform private.create_due_preplot_events();
  update public.native_notification_deliveries d set status = 'discarded'
    from public.notification_events e, public.native_push_subscriptions s
    where d.event_id = e.id and d.subscription_id = s.id and e.event_type = 'preplot'
      and d.status in ('queued', 'failed', 'sending') and not private.native_notification_current(e, s);
  insert into public.native_notification_deliveries(event_id, subscription_id)
  select e.id, s.id from public.notification_events e join public.native_push_subscriptions s on s.user_id = e.recipient_user_id
  where e.created_at > clock_timestamp() - interval '24 hours'
    and e.acknowledged_at is null and private.native_notification_current(e, s) on conflict do nothing;
  for v_job in select d.id, d.attempts + 1 as attempt, s.token, e.id as event_id, e.recipient_user_id, e.night_id,
      e.event_type, e.title, e.body, e.expires_at
    from public.native_notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    join public.native_push_subscriptions s on s.id = d.subscription_id
    where d.status in ('queued', 'failed', 'sending') and d.attempts < 5 and d.next_attempt_at <= clock_timestamp()
      and private.native_notification_current(e, s)
    order by d.next_attempt_at, d.id limit least(greatest(p_limit, 1), 100) for update of d skip locked
  loop
    update public.native_notification_deliveries set status = 'sending', attempts = v_job.attempt,
      next_attempt_at = clock_timestamp() + interval '2 minutes' where id = v_job.id;
    v_result := v_result || jsonb_build_array(jsonb_build_object('deliveryId', v_job.id, 'attempt', v_job.attempt,
      'token', v_job.token, 'eventId', v_job.event_id, 'recipientUserId', v_job.recipient_user_id, 'nightId', v_job.night_id)
      || case when v_job.event_type = 'preplot' then jsonb_build_object('preplot', true, 'title', v_job.title,
        'body', v_job.body, 'expiresAt', v_job.expires_at) else '{}'::jsonb end);
  end loop;
  return v_result;
end $$;

-- Taps must still resolve after a short campaign window expires or the inbox's
-- latest-100 page fills up. Ownership is checked before returning any content.
create function public.get_my_notification_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.notification_events;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_event from public.notification_events where id = p_event_id and recipient_user_id = auth.uid();
  if not found then return null; end if;
  -- Only pre-plot taps bypass expiry; existing check-ins/reminders still obey
  -- membership, current preferences, and the original lifecycle rules.
  if v_event.event_type <> 'preplot' and not private.notification_is_current(v_event) then return null; end if;
  return jsonb_build_object('id', v_event.id, 'eventKey', v_event.event_key, 'recipientUserId', v_event.recipient_user_id,
    'senderUserId', v_event.sender_user_id, 'nightId', v_event.night_id, 'targetMemberId', v_event.target_member_id,
    'category', v_event.category, 'eventType', v_event.event_type, 'title', v_event.title, 'body', v_event.body,
    'deepLink', v_event.deep_link, 'createdAt', v_event.created_at, 'expiresAt', v_event.expires_at,
    'acknowledgedAt', v_event.acknowledged_at);
end $$;
revoke all on function public.get_my_notification_event(uuid) from public, anon;
grant execute on function public.get_my_notification_event(uuid) to authenticated;

commit;
