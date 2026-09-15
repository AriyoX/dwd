begin;

-- Durable state for explicit setup completion and optimistic plan editing.
alter table public.night_members
  add column if not exists plan_setup_completed_at timestamptz,
  add column if not exists plan_revision integer not null default 0,
  add column if not exists display_name_at_end text;

update public.night_members m
set display_name_at_end = m.display_name
from public.nights n
where n.id = m.night_id and n.status = 'ended' and m.display_name_at_end is null;

update public.night_members m
set plan_setup_completed_at = coalesce(
  (
    select max(p.created_at)
    from public.drink_plan_items p
    where p.night_member_id = m.id
  ),
  m.joined_at
)
where m.plan_setup_completed_at is null
  and (m.member_type = 'guest' or m.role = 'host')
  and (
    m.member_type = 'guest'
    or exists (select 1 from public.drink_plan_items p where p.night_member_id = m.id)
    or m.role = 'host'
  );

alter table public.night_members
  add constraint night_members_plan_setup_after_join
  check (plan_setup_completed_at is null or plan_setup_completed_at >= joined_at);

alter table public.night_members
  add constraint night_members_plan_revision_nonnegative
  check (plan_revision >= 0);

-- Account preferences are separate from browser permission and push capability.
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  group_attention_enabled boolean not null default true,
  direct_checkins_enabled boolean not null default true,
  personal_pace_enabled boolean not null default false,
  planned_end_enabled boolean not null default false,
  periodic_water_enabled boolean not null default false,
  periodic_interval_minutes integer not null default 60,
  updated_at timestamptz not null default clock_timestamp(),
  constraint notification_preferences_interval_check
    check (periodic_interval_minutes in (30, 60, 90))
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  night_id uuid references public.nights(id) on delete cascade,
  target_member_id uuid references public.night_members(id) on delete set null,
  category text not null check (category in ('group_attention', 'direct_checkin', 'personal_reminder')),
  event_type text not null check (event_type in ('group_attention', 'direct_checkin', 'personal_pace', 'planned_end', 'periodic_water')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 240),
  deep_link text not null check (deep_link like '/%' and char_length(deep_link) <= 240),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  acknowledged_at timestamptz,
  constraint notification_events_key_recipient_unique unique (event_key, recipient_user_id),
  constraint notification_events_expiry_check check (expires_at is null or expires_at > created_at)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 16 and 512),
  auth text not null check (char_length(auth) between 8 and 256),
  expiration_time timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  disabled_at timestamptz
);

create table public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  night_id uuid not null references public.nights(id) on delete cascade,
  kind text not null check (kind in ('planned_end', 'periodic_water')),
  next_due_at timestamptz not null,
  interval_minutes integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint notification_schedules_interval_check
    check (kind = 'planned_end' and interval_minutes is null or kind = 'periodic_water' and interval_minutes in (30, 60, 90)),
  constraint notification_schedules_user_night_kind_unique unique (user_id, night_id, kind)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'invalid')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  constraint notification_deliveries_event_subscription_unique unique (event_id, subscription_id)
);

create table public.checkin_requests (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  target_member_id uuid not null references public.night_members(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  request_key uuid not null,
  status text not null default 'pending' check (status in ('pending', 'seen', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  seen_at timestamptz,
  expires_at timestamptz not null,
  constraint checkin_requests_sender_key_unique unique (sender_user_id, request_key),
  constraint checkin_requests_expiry_check check (expires_at > created_at),
  constraint checkin_requests_not_self check (sender_user_id <> recipient_user_id)
);

create index notification_events_recipient_idx
  on public.notification_events (recipient_user_id, created_at desc, id);
create index notification_events_night_idx
  on public.notification_events (night_id, created_at desc) where night_id is not null;
create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id, updated_at desc);
create index notification_schedules_due_idx
  on public.notification_schedules (next_due_at, id);
create index notification_deliveries_due_idx
  on public.notification_deliveries (status, next_attempt_at, id);
create index checkin_requests_recipient_idx
  on public.checkin_requests (recipient_user_id, created_at desc, id);
create index checkin_requests_sender_idx
  on public.checkin_requests (sender_user_id, created_at desc, id);
create index checkin_requests_cooldown_idx
  on public.checkin_requests (night_id, sender_user_id, recipient_user_id, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_schedules enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.checkin_requests enable row level security;

create policy notification_preferences_select_own
on public.notification_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy notification_events_select_own
on public.notification_events for select to authenticated
using ((select auth.uid()) = recipient_user_id);

create policy notification_events_acknowledge_own
on public.notification_events for update to authenticated
using ((select auth.uid()) = recipient_user_id)
with check ((select auth.uid()) = recipient_user_id);

create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

create policy checkin_requests_select_sender_or_recipient
on public.checkin_requests for select to authenticated
using ((select auth.uid()) in (sender_user_id, recipient_user_id));

create policy checkin_requests_acknowledge_recipient
on public.checkin_requests for update to authenticated
using ((select auth.uid()) = recipient_user_id)
with check ((select auth.uid()) = recipient_user_id);

revoke all on table
  public.notification_preferences,
  public.notification_events,
  public.push_subscriptions,
  public.notification_schedules,
  public.notification_deliveries,
  public.checkin_requests
from anon, authenticated;
grant select on table
  public.notification_preferences,
  public.notification_events,
  public.push_subscriptions,
  public.checkin_requests
to authenticated;
grant update (acknowledged_at) on public.notification_events to authenticated;
grant update (status, seen_at) on public.checkin_requests to authenticated;

create or replace function private.mark_initial_plan_setup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_setup_completed_at is null and (new.member_type = 'guest' or new.role = 'host') then
    new.plan_setup_completed_at := new.joined_at;
  end if;
  return new;
end;
$$;

create trigger night_members_mark_initial_plan_setup
before insert on public.night_members
for each row execute function private.mark_initial_plan_setup();

create or replace function private.validate_plan(p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer;
  v_quick_count integer := 0;
  v_volume numeric;
  v_abv numeric;
  v_quantity integer;
  v_quick boolean;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' then
    raise exception 'Plan items must be an array.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_plan);
  if v_count > 20 then
    raise exception 'A plan must contain between 0 and 20 items.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_plan)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or char_length(btrim(coalesce(v_item ->> 'label', ''))) not between 1 and 60
      or coalesce(v_item ->> 'category', '') not in ('beer', 'wine', 'spirit', 'cocktail', 'other') then
      raise exception 'Plan item details are invalid.' using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'volumeMl', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      or coalesce(v_item ->> 'abvPercent', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      or coalesce(v_item ->> 'plannedQuantity', '') !~ '^[0-9]+$' then
      raise exception 'Plan item numbers are invalid.' using errcode = '22023';
    end if;
    begin
      v_volume := (v_item ->> 'volumeMl')::numeric;
      v_abv := (v_item ->> 'abvPercent')::numeric;
      v_quantity := (v_item ->> 'plannedQuantity')::integer;
      v_quick := coalesce((v_item ->> 'isQuickLog')::boolean, false);
    exception when others then
      raise exception 'Plan item numbers are invalid.' using errcode = '22023';
    end;
    if v_volume not between 1 and 2000
      or v_abv <= 0 or v_abv > 95
      or v_quantity not between 1 and 50 then
      raise exception 'Plan item numbers are invalid.' using errcode = '22023';
    end if;
    if v_quick then v_quick_count := v_quick_count + 1; end if;
  end loop;

  if v_count > 0 and v_quick_count <> 1 then
    raise exception 'Choose exactly one quick-log item.' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.insert_notification_event(
  p_event_key text,
  p_recipient_user_id uuid,
  p_sender_user_id uuid,
  p_night_id uuid,
  p_target_member_id uuid,
  p_category text,
  p_event_type text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null or p_event_key is null then return null; end if;
  insert into public.notification_events (
    event_key, recipient_user_id, sender_user_id, night_id, target_member_id,
    category, event_type, title, body, deep_link, expires_at
  ) values (
    p_event_key, p_recipient_user_id, p_sender_user_id, p_night_id, p_target_member_id,
    p_category, p_event_type, p_title, p_body, p_deep_link, p_expires_at
  )
  on conflict (event_key, recipient_user_id) do nothing
  returning id into v_id;
  if v_id is null then
    select e.id into v_id
    from public.notification_events e
    where e.event_key = p_event_key and e.recipient_user_id = p_recipient_user_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.emit_notification_for_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_affected public.night_members%rowtype;
  v_recipient uuid;
  v_enabled boolean;
  v_title text;
begin
  select * into v_affected from public.night_members where id = new.night_member_id;
  if new.visibility = 'group' then
    for v_recipient in
      select distinct m.user_id
      from public.night_members m
      where m.night_id = new.night_id
        and m.user_id is not null
        and m.left_at is null
        and m.member_type = 'account'
        and m.user_id is distinct from v_affected.user_id
        and m.user_id is distinct from v_affected.managed_by_user_id
    loop
      select coalesce(p.group_attention_enabled, true)
      into v_enabled
      from public.notification_preferences p
      where p.user_id = v_recipient;
      if coalesce(v_enabled, true) then
        perform private.insert_notification_event(
          'alert:' || new.id::text,
          v_recipient,
          null,
          new.night_id,
          new.night_member_id,
          'group_attention',
          'group_attention',
          'Check in with ' || coalesce(v_affected.display_name, 'a participant'),
          new.message,
          '/night/' || new.night_id::text,
          new.expires_at
        );
      end if;
    end loop;
  else
    v_recipient := coalesce(v_affected.user_id, v_affected.managed_by_user_id);
    if v_recipient is null then return new; end if;
    select case
      when new.type = 'personal_pace' then coalesce(p.personal_pace_enabled, false)
      else coalesce(p.planned_end_enabled, false)
    end
    into v_enabled
    from public.notification_preferences p
    where p.user_id = v_recipient;
    if coalesce(v_enabled, false) then
      v_title := case when new.type = 'personal_pace' then 'Personal pace reminder' else 'Plan reminder' end;
      perform private.insert_notification_event(
        'alert:' || new.id::text,
        v_recipient,
        null,
        new.night_id,
        new.night_member_id,
        'personal_reminder',
        new.type,
        v_title,
        new.message,
        '/night/' || new.night_id::text,
        new.expires_at
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger night_alerts_emit_notification
after insert on public.night_alerts
for each row execute function private.emit_notification_for_alert();

create or replace function private.sync_notification_schedules(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planned_end boolean := false;
  v_periodic boolean := false;
  v_interval integer := 60;
  v_now timestamptz := clock_timestamp();
  v_night record;
begin
  if p_user_id is null then return; end if;
  select
    coalesce(p.planned_end_enabled, false),
    coalesce(p.periodic_water_enabled, false),
    coalesce(p.periodic_interval_minutes, 60)
  into v_planned_end, v_periodic, v_interval
  from public.notification_preferences p
  where p.user_id = p_user_id;

  delete from public.notification_schedules s
  where s.user_id = p_user_id
    and (
      (s.kind = 'planned_end' and not v_planned_end)
      or (s.kind = 'periodic_water' and not v_periodic)
      or not exists (
        select 1
        from public.night_members m
        join public.nights n on n.id = m.night_id
        where m.user_id = p_user_id
          and m.left_at is null
          and n.status = 'active'
          and n.id = s.night_id
      )
    );

  for v_night in
    select n.id, n.ends_at
    from public.nights n
    join public.night_members m on m.night_id = n.id
    where m.user_id = p_user_id and m.left_at is null and n.status = 'active'
  loop
    if v_planned_end then
      insert into public.notification_schedules (
        user_id, night_id, kind, next_due_at, interval_minutes
      ) values (
        p_user_id, v_night.id, 'planned_end', v_night.ends_at, null
      )
      on conflict (user_id, night_id, kind) do update
      set next_due_at = excluded.next_due_at,
          updated_at = v_now;
    end if;
    if v_periodic then
      insert into public.notification_schedules (
        user_id, night_id, kind, next_due_at, interval_minutes
      ) values (
        p_user_id,
        v_night.id,
        'periodic_water',
        v_now + make_interval(mins => v_interval),
        v_interval
      )
      on conflict (user_id, night_id, kind) do update
      set interval_minutes = excluded.interval_minutes,
          next_due_at = case
            when public.notification_schedules.interval_minutes is distinct from excluded.interval_minutes
              then excluded.next_due_at
            else public.notification_schedules.next_due_at
          end,
          updated_at = v_now;
    end if;
  end loop;
end;
$$;

create or replace function private.sync_notification_schedules_after_night()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  for v_user in
    select m.user_id from public.night_members m
    where m.night_id = new.id and m.user_id is not null
  loop
    perform private.sync_notification_schedules(v_user);
  end loop;
  return new;
end;
$$;

create trigger nights_sync_notification_schedules
after update of status, ends_at on public.nights
for each row execute function private.sync_notification_schedules_after_night();

create or replace function private.capture_finished_member_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ended' and old.status is distinct from new.status then
    update public.night_members
    set display_name_at_end = display_name
    where night_id = new.id and display_name_at_end is null;
  end if;
  return new;
end;
$$;

create trigger nights_capture_finished_member_names
after update of status on public.nights
for each row execute function private.capture_finished_member_names();

create or replace function private.sync_notification_schedules_after_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then perform private.sync_notification_schedules(new.user_id); end if;
  if tg_op = 'UPDATE' and old.user_id is not null and old.user_id is distinct from new.user_id then
    perform private.sync_notification_schedules(old.user_id);
  end if;
  return new;
end;
$$;

create trigger night_members_sync_notification_schedules
after insert or update of user_id, left_at on public.night_members
for each row execute function private.sync_notification_schedules_after_member();

create or replace function private.restore_profile_name_on_rejoin()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text;
begin
  if new.user_id is not null and new.left_at is null and old.left_at is not null then
    select p.display_name into v_name
    from public.profiles p
    where p.id = new.user_id;
    if v_name is not null then
      update public.night_members
      set display_name = v_name
      where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger night_members_restore_profile_name
after update of left_at on public.night_members
for each row execute function private.restore_profile_name_on_rejoin();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

create trigger notification_schedules_set_updated_at
before update on public.notification_schedules
for each row execute function private.set_updated_at();

create or replace function public.get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_preferences public.notification_preferences%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_preferences from public.notification_preferences where user_id = v_actor;
  return jsonb_build_object(
    'groupAttentionEnabled', coalesce(v_preferences.group_attention_enabled, true),
    'directCheckinsEnabled', coalesce(v_preferences.direct_checkins_enabled, true),
    'personalPaceEnabled', coalesce(v_preferences.personal_pace_enabled, false),
    'plannedEndEnabled', coalesce(v_preferences.planned_end_enabled, false),
    'periodicWaterEnabled', coalesce(v_preferences.periodic_water_enabled, false),
    'periodicIntervalMinutes', coalesce(v_preferences.periodic_interval_minutes, 60)
  );
end;
$$;

create or replace function public.update_notification_preferences(
  p_group_attention_enabled boolean,
  p_direct_checkins_enabled boolean,
  p_personal_pace_enabled boolean,
  p_planned_end_enabled boolean,
  p_periodic_water_enabled boolean,
  p_periodic_interval_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_periodic_interval_minutes not in (30, 60, 90) then
    raise exception 'Reminder interval is invalid.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (
    user_id, group_attention_enabled, direct_checkins_enabled, personal_pace_enabled,
    planned_end_enabled, periodic_water_enabled, periodic_interval_minutes
  ) values (
    v_actor, p_group_attention_enabled, p_direct_checkins_enabled, p_personal_pace_enabled,
    p_planned_end_enabled, p_periodic_water_enabled, p_periodic_interval_minutes
  )
  on conflict (user_id) do update set
    group_attention_enabled = excluded.group_attention_enabled,
    direct_checkins_enabled = excluded.direct_checkins_enabled,
    personal_pace_enabled = excluded.personal_pace_enabled,
    planned_end_enabled = excluded.planned_end_enabled,
    periodic_water_enabled = excluded.periodic_water_enabled,
    periodic_interval_minutes = excluded.periodic_interval_minutes,
    updated_at = clock_timestamp();
  perform private.sync_notification_schedules(v_actor);
  return public.get_notification_preferences();
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) not between 20 and 2048
    or p_p256dh is null or char_length(p_p256dh) not between 16 and 512
    or p_auth is null or char_length(p_auth) not between 8 and 256 then
    raise exception 'Push subscription is invalid.' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_actor;
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, expiration_time, disabled_at
  ) values (
    v_actor, p_endpoint, p_p256dh, p_auth, p_expiration_time, null
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    expiration_time = excluded.expiration_time,
    disabled_at = null,
    updated_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_actor;
  return jsonb_build_object('removed', true);
end;
$$;

create or replace function public.acknowledge_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update public.notification_events
  set acknowledged_at = coalesce(acknowledged_at, clock_timestamp())
  where id = p_notification_id and recipient_user_id = v_actor;
  if not found then raise exception 'Notification not found.' using errcode = '42501'; end if;
  return jsonb_build_object('acknowledged', true);
end;
$$;

create or replace function public.get_my_notification_events(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(rows.row_value order by rows.created_at desc, rows.event_id)
    from (
      select
        e.id as event_id,
        e.created_at,
        jsonb_build_object(
          'id', e.id,
          'eventKey', e.event_key,
          'recipientUserId', e.recipient_user_id,
          'senderUserId', e.sender_user_id,
          'nightId', e.night_id,
          'targetMemberId', e.target_member_id,
          'category', e.category,
          'eventType', e.event_type,
          'title', e.title,
          'body', e.body,
          'deepLink', e.deep_link,
          'createdAt', e.created_at,
          'expiresAt', e.expires_at,
          'acknowledgedAt', e.acknowledged_at
        ) as row_value
      from public.notification_events e
      where e.recipient_user_id = v_actor
        and (e.expires_at is null or e.expires_at > clock_timestamp())
      order by e.created_at desc, e.id
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.send_check_in(
  p_night_id uuid,
  p_target_member_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night public.nights%rowtype;
  v_actor_member public.night_members%rowtype;
  v_target public.night_members%rowtype;
  v_existing public.checkin_requests%rowtype;
  v_recipient uuid;
  v_request_id uuid;
  v_sender_name text;
  v_enabled boolean;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'Check-in request is invalid.' using errcode = '22023';
  end if;
  select * into v_existing
  from public.checkin_requests
  where sender_user_id = v_actor and request_key = p_request_key;
  if found then
    return jsonb_build_object('status', 'sent', 'requestId', v_existing.id, 'duplicate', true);
  end if;

  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.status <> 'active' then
    raise exception 'This night is no longer active.' using errcode = '55000';
  end if;
  select * into v_actor_member
  from public.night_members
  where night_id = p_night_id and user_id = v_actor and left_at is null
  for update;
  if not found then raise exception 'Night not found.' using errcode = '42501'; end if;
  select * into v_target from public.night_members
  where id = p_target_member_id and night_id = p_night_id and left_at is null;
  if not found then raise exception 'That participant is no longer active.' using errcode = '42501'; end if;
  if v_target.member_type = 'account' and v_target.user_id = v_actor then
    raise exception 'You cannot check in on yourself.' using errcode = '22023';
  end if;

  v_recipient := coalesce(v_target.user_id, v_target.managed_by_user_id);
  if v_recipient is null then
    raise exception 'That participant cannot receive a check-in.' using errcode = '22023';
  end if;
  if v_recipient = v_actor then
    return jsonb_build_object(
      'status', 'local_only',
      'message', 'You manage this guest. Check in with them directly on this device.'
    );
  end if;
  if exists (
    select 1 from public.checkin_requests c
    where c.night_id = p_night_id
      and c.sender_user_id = v_actor
      and c.recipient_user_id = v_recipient
      and c.created_at > v_now - interval '60 seconds'
  ) then
    return jsonb_build_object(
      'status', 'cooldown',
      'message', 'You already sent a check-in. Try again in a moment.'
    );
  end if;

  select m.display_name into v_sender_name from public.night_members m
  where m.id = v_actor_member.id;
  insert into public.checkin_requests (
    night_id, target_member_id, sender_user_id, recipient_user_id,
    request_key, expires_at
  ) values (
    p_night_id, p_target_member_id, v_actor, v_recipient,
    p_request_key, v_now + interval '2 hours'
  ) returning id into v_request_id;

  select coalesce(p.direct_checkins_enabled, true)
  into v_enabled
  from public.notification_preferences p
  where p.user_id = v_recipient;
  if coalesce(v_enabled, true) then
    perform private.insert_notification_event(
      'checkin:' || v_request_id::text,
      v_recipient,
      v_actor,
      p_night_id,
      p_target_member_id,
      'direct_checkin',
      'direct_checkin',
      case when v_target.member_type = 'guest'
        then 'Check-in request for ' || v_target.display_name
        else coalesce(v_sender_name, 'Someone') || ' checked in on you'
      end,
      case when v_target.member_type = 'guest'
        then coalesce(v_sender_name, 'Someone') || ' asked the host to check in with ' || v_target.display_name || '.'
        else coalesce(v_sender_name, 'Someone') || ' checked in on you.'
      end,
      '/night/' || p_night_id::text,
      v_now + interval '2 hours'
    );
  end if;
  return jsonb_build_object('status', 'sent', 'requestId', v_request_id, 'duplicate', false);
exception
  when unique_violation then
    select * into v_existing
    from public.checkin_requests
    where sender_user_id = v_actor and request_key = p_request_key;
    if found then
      return jsonb_build_object('status', 'sent', 'requestId', v_existing.id, 'duplicate', true);
    end if;
    raise;
end;
$$;

create or replace function public.acknowledge_check_in(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update public.checkin_requests
  set status = 'seen', seen_at = coalesce(seen_at, clock_timestamp())
  where id = p_request_id and recipient_user_id = v_actor and status = 'pending';
  if not found then raise exception 'Check-in request not found.' using errcode = '42501'; end if;
  update public.notification_events
  set acknowledged_at = coalesce(acknowledged_at, clock_timestamp())
  where event_type = 'direct_checkin'
    and recipient_user_id = v_actor
    and event_key = 'checkin:' || p_request_id::text;
  return jsonb_build_object('acknowledged', true);
end;
$$;

create or replace function public.get_finished_nights(p_page integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_page integer := greatest(coalesce(p_page, 0), 0);
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_value order by ended_at desc, night_id)
    from (
      select
        n.id as night_id,
        n.ended_at,
        jsonb_build_object(
          'id', n.id,
          'title', n.title,
          'startsAt', n.starts_at,
          'endsAt', n.ends_at,
          'endedAt', n.ended_at,
          'timezone', n.timezone,
          'role', m.role,
          'memberId', m.id,
          'alcoholCount', (
            select count(*) from public.drink_logs d
            where d.night_member_id = m.id and d.deleted_at is null
          ),
          'waterCount', (
            select count(*) from public.water_logs w
            where w.night_member_id = m.id and w.deleted_at is null
          ),
          'categoryCounts', coalesce((
            select jsonb_object_agg(c.category, c.count_value)
            from (
              select d.category_snapshot as category, count(*) as count_value
              from public.drink_logs d
              where d.night_member_id = m.id and d.deleted_at is null
              group by d.category_snapshot
            ) c
          ), '{}'::jsonb)
        ) as row_value
      from public.nights n
      join public.night_members m on m.night_id = n.id and m.user_id = v_actor
      where n.status = 'ended'
      order by n.ended_at desc, n.id
      limit 21 offset (v_page * 20)
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_finished_night_summary(p_night_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_night public.nights%rowtype;
  v_member public.night_members%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select n.* into v_night from public.nights n where n.id = p_night_id and n.status = 'ended';
  select m.* into v_member from public.night_members m
  where m.night_id = p_night_id and m.user_id = v_actor;
  if not found or v_night.id is null then raise exception 'Night not found.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'night', jsonb_build_object(
      'id', v_night.id,
      'hostUserId', v_night.host_user_id,
      'title', v_night.title,
      'status', v_night.status,
      'startsAt', v_night.starts_at,
      'initialEndsAt', v_night.initial_ends_at,
      'endsAt', v_night.ends_at,
      'endedAt', v_night.ended_at,
      'timezone', v_night.timezone
    ),
    'historyScope', 'personal',
    'currentUserId', v_actor,
    'currentMemberId', v_member.id,
    'members', jsonb_build_array(jsonb_build_object(
      'id', v_member.id,
      'nightId', v_member.night_id,
      'userId', v_member.user_id,
      'displayName', coalesce(v_member.display_name_at_end, v_member.display_name),
      'memberType', v_member.member_type,
      'role', v_member.role,
      'managedByUserId', v_member.managed_by_user_id,
      'joinedAt', v_member.joined_at,
      'leftAt', v_member.left_at,
      'planSetupCompletedAt', v_member.plan_setup_completed_at,
      'planRevision', v_member.plan_revision,
      'planItems', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'nightMemberId', p.night_member_id,
          'label', p.label,
          'category', p.category,
          'volumeMl', p.volume_ml,
          'abvPercent', p.abv_percent,
          'plannedQuantity', p.planned_quantity,
          'isQuickLog', p.is_quick_log,
          'createdBy', p.created_by,
          'createdAt', p.created_at,
          'archivedAt', p.archived_at,
          'updatedAt', p.updated_at
        ) order by p.created_at, p.id)
        from public.drink_plan_items p where p.night_member_id = v_member.id
      ), '[]'::jsonb),
      'drinkLogs', coalesce((
        select jsonb_agg(private.drink_log_json(d) order by d.consumed_at, d.id)
        from public.drink_logs d where d.night_member_id = v_member.id and d.deleted_at is null
      ), '[]'::jsonb),
      'waterLogs', coalesce((
        select jsonb_agg(private.water_log_json(w) order by w.consumed_at, w.id)
        from public.water_logs w where w.night_member_id = v_member.id and w.deleted_at is null
      ), '[]'::jsonb)
    )),
    'alerts', '[]'::jsonb,
    'endTimeChanges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nightId', c.night_id,
        'changedBy', c.changed_by,
        'previousEndsAt', c.previous_ends_at,
        'newEndsAt', c.new_ends_at,
        'effectiveAt', c.effective_at
      ) order by c.effective_at, c.id)
      from public.night_end_time_changes c where c.night_id = p_night_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.build_night_snapshot(p_night_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_current_member uuid;
begin
  select m.id into v_current_member
  from public.night_members m
  where m.night_id = p_night_id
    and m.user_id = p_user_id
    and m.left_at is null;
  if v_current_member is null then
    raise exception 'Night not found.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'night', jsonb_build_object(
      'id', n.id,
      'hostUserId', n.host_user_id,
      'title', n.title,
      'status', n.status,
      'startsAt', n.starts_at,
      'initialEndsAt', n.initial_ends_at,
      'endsAt', n.ends_at,
      'endedAt', n.ended_at,
      'timezone', n.timezone
    ),
    'historyScope', 'group',
    'currentUserId', p_user_id,
    'currentMemberId', v_current_member,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'nightId', m.night_id,
          'userId', m.user_id,
          'displayName', case when n.status = 'ended' then coalesce(m.display_name_at_end, m.display_name) else m.display_name end,
          'memberType', m.member_type,
          'role', m.role,
          'managedByUserId', m.managed_by_user_id,
          'joinedAt', m.joined_at,
          'leftAt', m.left_at,
          'planSetupCompletedAt', m.plan_setup_completed_at,
          'planRevision', m.plan_revision,
          'planItems', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id,
              'nightMemberId', p.night_member_id,
              'label', p.label,
              'category', p.category,
              'volumeMl', p.volume_ml,
              'abvPercent', p.abv_percent,
              'plannedQuantity', p.planned_quantity,
              'isQuickLog', p.is_quick_log,
              'createdBy', p.created_by,
              'createdAt', p.created_at,
              'archivedAt', p.archived_at,
              'updatedAt', p.updated_at
            ) order by p.created_at, p.id)
            from public.drink_plan_items p
            where p.night_member_id = m.id and p.archived_at is null
          ), '[]'::jsonb),
          'drinkLogs', coalesce((
            select jsonb_agg(private.drink_log_json(d) order by d.consumed_at, d.id)
            from public.drink_logs d
            where d.night_member_id = m.id and d.deleted_at is null
          ), '[]'::jsonb),
          'waterLogs', coalesce((
            select jsonb_agg(private.water_log_json(w) order by w.consumed_at, w.id)
            from public.water_logs w
            where w.night_member_id = m.id and w.deleted_at is null
          ), '[]'::jsonb)
        ) order by (m.role = 'host') desc, m.joined_at, m.id
      )
      from public.night_members m where m.night_id = n.id
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(private.alert_json(a) order by a.created_at desc)
      from public.night_alerts a
      left join public.night_members affected on affected.id = a.night_member_id
      where a.night_id = n.id
        and (a.expires_at is null or a.expires_at > statement_timestamp())
        and (
          a.visibility = 'group'
          or affected.user_id = p_user_id
          or affected.managed_by_user_id = p_user_id
        )
    ), '[]'::jsonb),
    'endTimeChanges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nightId', c.night_id,
        'changedBy', c.changed_by,
        'previousEndsAt', c.previous_ends_at,
        'newEndsAt', c.new_ends_at,
        'effectiveAt', c.effective_at
      ) order by c.effective_at, c.id)
      from public.night_end_time_changes c where c.night_id = n.id
    ), '[]'::jsonb)
  ) into v_result
  from public.nights n
  where n.id = p_night_id;

  if v_result is null then raise exception 'Night not found.' using errcode = '42501'; end if;
  return v_result;
end;
$$;

create or replace function public.replace_member_plan_v2(
  p_member_id uuid,
  p_items jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_member public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_item jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.validate_plan(p_items);
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found then raise exception 'Member not found.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = v_member.night_id for update;
  if v_night.status <> 'active' then raise exception 'Ended nights are read-only.' using errcode = '55000'; end if;
  if not private.is_current_night_member(v_night.id, v_actor) then
    raise exception 'Member not found.' using errcode = '42501';
  end if;
  if not (
    (v_member.member_type = 'account' and v_member.user_id = v_actor and v_member.left_at is null)
    or private.can_manage_member(v_member.id, v_actor)
  ) then
    raise exception 'You cannot edit this plan.' using errcode = '42501';
  end if;
  if p_expected_revision is not null and p_expected_revision <> v_member.plan_revision then
    raise exception 'This plan changed in another tab. Reload and review it.' using errcode = '40001';
  end if;

  select coalesce(sum(round(p.volume_ml * (p.abv_percent / 100.0) * 0.789, 3) * p.planned_quantity), 0)
  into v_old_total
  from public.drink_plan_items p
  where p.night_member_id = v_member.id and p.archived_at is null;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_new_total := v_new_total + round(
      (v_item ->> 'volumeMl')::numeric * ((v_item ->> 'abvPercent')::numeric / 100.0) * 0.789,
      3
    ) * (v_item ->> 'plannedQuantity')::integer;
  end loop;

  update public.drink_plan_items
  set archived_at = v_now, is_quick_log = false, updated_at = v_now
  where night_member_id = v_member.id and archived_at is null;
  perform private.insert_plan(v_member.id, v_actor, p_items, v_now);
  update public.night_members
  set plan_setup_completed_at = coalesce(plan_setup_completed_at, v_now),
      plan_revision = plan_revision + 1
  where id = v_member.id;

  if v_new_total > v_old_total + 0.01 then
    insert into public.audit_events (
      night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
    ) values (
      v_night.id,
      v_actor,
      'plan.increased',
      'night_member',
      v_member.id,
      jsonb_build_object('planned_ethanol_grams', round(v_old_total, 3)),
      jsonb_build_object('planned_ethanol_grams', round(v_new_total, 3)),
      v_now
    );
  end if;
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

create or replace function public.replace_member_plan(p_member_id uuid, p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.replace_member_plan_v2(p_member_id, p_items, null);
$$;

create or replace function public.redeem_night_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_invite public.night_invites%rowtype;
  v_night public.nights%rowtype;
  v_member public.night_members%rowtype;
  v_profile_name text;
  v_joined boolean := false;
  v_reactivated boolean := false;
  v_needs_plan boolean;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation unavailable.' using errcode = '22023';
  end if;
  select * into v_invite from public.night_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'Invitation unavailable.' using errcode = '22023'; end if;
  select * into v_night from public.nights where id = v_invite.night_id for update;
  if v_night.status = 'ended' or v_invite.revoked_at is not null or v_invite.expires_at <= v_now then
    raise exception 'Invitation unavailable.' using errcode = '22023';
  end if;

  select * into v_member from public.night_members
  where night_id = v_night.id and user_id = v_actor for update;
  if found then
    if v_member.left_at is not null then
      update public.night_members set left_at = null where id = v_member.id returning * into v_member;
      v_reactivated := true;
    end if;
  else
    if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
      raise exception 'Invitation unavailable.' using errcode = '22023';
    end if;
    select p.display_name into v_profile_name from public.profiles p where p.id = v_actor;
    if v_profile_name is null then raise exception 'A valid profile is required.' using errcode = '22023'; end if;
    insert into public.night_members (
      night_id, user_id, display_name, member_type, role, joined_at
    ) values (
      v_night.id, v_actor, v_profile_name, 'account', 'member', v_now
    ) returning * into v_member;
    update public.night_invites set use_count = use_count + 1 where id = v_invite.id;
    v_joined := true;
  end if;
  v_needs_plan := v_member.plan_setup_completed_at is null;
  return jsonb_build_object(
    'nightId', v_night.id,
    'memberId', v_member.id,
    'joined', v_joined,
    'reactivated', v_reactivated,
    'needsPlan', v_needs_plan
  );
end;
$$;

create or replace function private.propagate_profile_name()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if new.display_name is not distinct from old.display_name then return new; end if;
  update public.night_members m
  set display_name = new.display_name
  from public.nights n
  where m.night_id = n.id
    and m.user_id = new.id
    and m.left_at is null
    and n.status = 'active';
  update public.nights n
  set updated_at = v_now
  where exists (
    select 1 from public.night_members m
    where m.night_id = n.id and m.user_id = new.id and m.left_at is null
  );
  return new;
end;
$$;

create trigger profiles_propagate_active_name
after update of display_name on public.profiles
for each row execute function private.propagate_profile_name();

create or replace function public.update_own_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_old_name text;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Display name must be between 1 and 60 characters.' using errcode = '22023';
  end if;
  select display_name into v_old_name from public.profiles where id = v_actor for update;
  if not found then raise exception 'Account unavailable.' using errcode = '42501'; end if;
  if v_old_name is distinct from v_name then
    update public.profiles set display_name = v_name where id = v_actor;
    update public.night_members
    set display_name = v_name
    from public.nights n
    where public.night_members.night_id = n.id
      and public.night_members.user_id = v_actor
      and public.night_members.left_at is null
      and n.status = 'active';
    insert into public.audit_events (
      actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      v_actor,
      'profile.display_name_changed',
      'profile',
      v_actor,
      jsonb_build_object('display_name', v_old_name),
      jsonb_build_object('display_name', v_name)
    );
  end if;
  return jsonb_build_object('displayName', v_name);
end;
$$;

create or replace function public.get_invite_preview(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_invite public.night_invites%rowtype;
  v_night public.nights%rowtype;
  v_host_name text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valid', false, 'reason', 'invalid'); end if;
  select * into v_invite from public.night_invites where token_hash = p_token_hash;
  if not found then return jsonb_build_object('valid', false, 'reason', 'invalid'); end if;
  select * into v_night from public.nights where id = v_invite.night_id;
  if v_night.status = 'ended' then return jsonb_build_object('valid', false, 'reason', 'ended'); end if;
  if v_invite.revoked_at is not null then return jsonb_build_object('valid', false, 'reason', 'revoked'); end if;
  if v_invite.expires_at <= v_now then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'full');
  end if;
  select p.display_name into v_host_name from public.profiles p where p.id = v_night.host_user_id;
  return jsonb_build_object(
    'valid', true,
    'nightTitle', v_night.title,
    'hostDisplayName', v_host_name,
    'startsAt', v_night.starts_at,
    'endsAt', v_night.ends_at,
    'timezone', v_night.timezone
  );
end;
$$;

create or replace function private.create_due_notification_events()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule record;
  v_enabled boolean;
  v_now timestamptz := clock_timestamp();
begin
  for v_schedule in
    select s.*, n.status, n.ends_at, n.title
    from public.notification_schedules s
    join public.nights n on n.id = s.night_id
    where s.next_due_at <= v_now
    order by s.next_due_at, s.id
    for update of s skip locked
  loop
    if v_schedule.status <> 'active' then
      delete from public.notification_schedules where id = v_schedule.id;
      continue;
    end if;
    if v_schedule.kind = 'planned_end' then
      select coalesce(p.planned_end_enabled, false) into v_enabled
      from public.notification_preferences p where p.user_id = v_schedule.user_id;
      if not coalesce(v_enabled, false) then
        delete from public.notification_schedules where id = v_schedule.id;
        continue;
      end if;
      perform private.insert_notification_event(
        'schedule:' || v_schedule.id::text || ':planned_end',
        v_schedule.user_id,
        null,
        v_schedule.night_id,
        null,
        'personal_reminder',
        'planned_end',
        'Planned night end',
        'Your planned night has ended.',
        '/night/' || v_schedule.night_id::text,
        v_now + interval '2 hours'
      );
      delete from public.notification_schedules where id = v_schedule.id;
    else
      select coalesce(p.periodic_water_enabled, false) into v_enabled
      from public.notification_preferences p where p.user_id = v_schedule.user_id;
      if not coalesce(v_enabled, false) then
        delete from public.notification_schedules where id = v_schedule.id;
        continue;
      end if;
      perform private.insert_notification_event(
        'schedule:' || v_schedule.id::text || ':' || floor(extract(epoch from v_now) / (v_schedule.interval_minutes * 60))::bigint,
        v_schedule.user_id,
        null,
        v_schedule.night_id,
        null,
        'personal_reminder',
        'periodic_water',
        'Personal reminder',
        'Take a moment to check in with yourself.',
        '/night/' || v_schedule.night_id::text,
        v_now + make_interval(mins => v_schedule.interval_minutes)
      );
      update public.notification_schedules
      set next_due_at = v_now + make_interval(mins => v_schedule.interval_minutes),
          updated_at = v_now
      where id = v_schedule.id;
    end if;
  end loop;
end;
$$;

create or replace function public.claim_notification_jobs(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_result jsonb := '[]'::jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  perform private.create_due_notification_events();
  insert into public.notification_deliveries (event_id, subscription_id)
  select e.id, s.id
  from public.notification_events e
  join public.push_subscriptions s on s.user_id = e.recipient_user_id and s.disabled_at is null
  left join public.notification_preferences p on p.user_id = e.recipient_user_id
  left join public.night_members recipient_member
    on recipient_member.night_id = e.night_id
   and recipient_member.user_id = e.recipient_user_id
   and recipient_member.left_at is null
  left join public.night_members target_member
    on target_member.id = e.target_member_id
   and target_member.left_at is null
  where e.acknowledged_at is null
    and e.created_at > clock_timestamp() - interval '24 hours'
    and (e.expires_at is null or e.expires_at > clock_timestamp())
    and (e.night_id is null or recipient_member.id is not null)
    and (e.target_member_id is null or target_member.id is not null)
    and case
      when e.category = 'group_attention' then coalesce(p.group_attention_enabled, true)
      when e.category = 'direct_checkin' then coalesce(p.direct_checkins_enabled, true)
      when e.event_type = 'personal_pace' then coalesce(p.personal_pace_enabled, false)
      when e.event_type = 'planned_end' then coalesce(p.planned_end_enabled, false)
      when e.event_type = 'periodic_water' then coalesce(p.periodic_water_enabled, false)
      else false
    end
  on conflict (event_id, subscription_id) do nothing;

  for v_job in
    select
      d.id as delivery_id,
      s.endpoint,
      s.p256dh,
      s.auth,
      e.category,
      e.deep_link,
      case when e.category = 'direct_checkin' then 'Someone checked in on you.'
           when e.category = 'group_attention' then 'A group attention update is available.'
           else 'You have a DWD reminder.' end as push_body
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    join public.push_subscriptions s on s.id = d.subscription_id
    left join public.notification_preferences p on p.user_id = e.recipient_user_id
    left join public.night_members recipient_member
      on recipient_member.night_id = e.night_id
     and recipient_member.user_id = e.recipient_user_id
     and recipient_member.left_at is null
    left join public.night_members target_member
      on target_member.id = e.target_member_id
     and target_member.left_at is null
    where d.status in ('queued', 'failed')
      and d.attempts < 5
      and d.next_attempt_at <= clock_timestamp()
      and s.disabled_at is null
      and e.acknowledged_at is null
      and e.created_at > clock_timestamp() - interval '24 hours'
      and (e.expires_at is null or e.expires_at > clock_timestamp())
      and (e.night_id is null or recipient_member.id is not null)
      and (e.target_member_id is null or target_member.id is not null)
      and case
        when e.category = 'group_attention' then coalesce(p.group_attention_enabled, true)
        when e.category = 'direct_checkin' then coalesce(p.direct_checkins_enabled, true)
        when e.event_type = 'personal_pace' then coalesce(p.personal_pace_enabled, false)
        when e.event_type = 'planned_end' then coalesce(p.planned_end_enabled, false)
        when e.event_type = 'periodic_water' then coalesce(p.periodic_water_enabled, false)
        else false
      end
    order by d.next_attempt_at, d.id
    limit v_limit
    for update of d skip locked
  loop
    update public.notification_deliveries
    set status = 'sending', attempts = attempts + 1
    where id = v_job.delivery_id;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'deliveryId', v_job.delivery_id,
      'endpoint', v_job.endpoint,
      'p256dh', v_job.p256dh,
      'auth', v_job.auth,
      'body', v_job.push_body,
      'url', v_job.deep_link
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function public.complete_notification_job(
  p_delivery_id uuid,
  p_delivered boolean,
  p_permanent_failure boolean default false,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_deliveries%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  select * into v_job from public.notification_deliveries where id = p_delivery_id for update;
  if not found then return jsonb_build_object('updated', false); end if;
  if p_delivered then
    update public.notification_deliveries
    set status = 'sent', delivered_at = v_now, last_error = null
    where id = p_delivery_id;
  elsif p_permanent_failure then
    update public.notification_deliveries
    set status = 'invalid', last_error = left(coalesce(p_error, 'Push endpoint is no longer valid.'), 500)
    where id = p_delivery_id;
    update public.push_subscriptions
    set disabled_at = v_now, updated_at = v_now
    where id = v_job.subscription_id;
  else
    update public.notification_deliveries
    set status = case when attempts >= 5 then 'failed' else 'failed' end,
        next_attempt_at = v_now + make_interval(mins => least(30, greatest(1, attempts * 2))),
        last_error = left(coalesce(p_error, 'Push delivery failed.'), 500)
    where id = p_delivery_id;
  end if;
  return jsonb_build_object('updated', true);
end;
$$;

revoke update on public.notification_events, public.checkin_requests from authenticated;

revoke execute on function private.mark_initial_plan_setup() from public, anon, authenticated;
revoke execute on function private.validate_plan(jsonb) from public, anon, authenticated;
revoke execute on function private.insert_notification_event(text, uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function private.emit_notification_for_alert() from public, anon, authenticated;
revoke execute on function private.sync_notification_schedules(uuid) from public, anon, authenticated;
revoke execute on function private.sync_notification_schedules_after_night() from public, anon, authenticated;
revoke execute on function private.sync_notification_schedules_after_member() from public, anon, authenticated;
revoke execute on function private.restore_profile_name_on_rejoin() from public, anon, authenticated;
revoke execute on function private.propagate_profile_name() from public, anon, authenticated;
revoke execute on function private.capture_finished_member_names() from public, anon, authenticated;
revoke execute on function private.create_due_notification_events() from public, anon, authenticated;

revoke execute on function public.get_notification_preferences() from public, anon;
revoke execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, integer) from public, anon;
revoke execute on function public.register_push_subscription(text, text, text, timestamptz) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
revoke execute on function public.acknowledge_notification(uuid) from public, anon;
revoke execute on function public.get_my_notification_events(integer) from public, anon;
revoke execute on function public.send_check_in(uuid, uuid, uuid) from public, anon;
revoke execute on function public.acknowledge_check_in(uuid) from public, anon;
revoke execute on function public.get_finished_nights(integer) from public, anon;
revoke execute on function public.get_finished_night_summary(uuid) from public, anon;
revoke execute on function public.replace_member_plan_v2(uuid, jsonb, integer) from public, anon;
revoke execute on function public.update_own_display_name(text) from public, anon;
revoke execute on function public.claim_notification_jobs(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification_job(uuid, boolean, boolean, text) from public, anon, authenticated;
revoke update on public.notification_events, public.checkin_requests from authenticated;

grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.register_push_subscription(text, text, text, timestamptz) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.acknowledge_notification(uuid) to authenticated;
grant execute on function public.get_my_notification_events(integer) to authenticated;
grant execute on function public.send_check_in(uuid, uuid, uuid) to authenticated;
grant execute on function public.acknowledge_check_in(uuid) to authenticated;
grant execute on function public.get_finished_nights(integer) to authenticated;
grant execute on function public.get_finished_night_summary(uuid) to authenticated;
grant execute on function public.replace_member_plan_v2(uuid, jsonb, integer) to authenticated;
grant execute on function public.update_own_display_name(text) to authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;
grant execute on function public.complete_notification_job(uuid, boolean, boolean, text) to service_role;

commit;
