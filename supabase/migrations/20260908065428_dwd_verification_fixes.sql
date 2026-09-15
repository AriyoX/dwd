begin;

-- Existing invitees with saved plan versions already completed setup before this release.
update public.night_members m set plan_setup_completed_at = greatest(m.joined_at,
 (select max(p.created_at) from public.drink_plan_items p where p.night_member_id = m.id))
where m.plan_setup_completed_at is null
 and exists (select 1 from public.drink_plan_items p where p.night_member_id = m.id);

-- Jobs carry a renewable lease and attempt token; late completions cannot overwrite a retry.

-- One delivery eligibility rule is checked again by the inbox and push worker.
create or replace function private.notification_is_current(e public.notification_events)
returns boolean language sql stable security definer set search_path = '' as $$
 select (e.expires_at is null or e.expires_at > statement_timestamp())
   and (e.night_id is null or exists (
     select 1 from public.nights n join public.night_members m on m.night_id = n.id
     where n.id = e.night_id and n.status = 'active' and m.user_id = e.recipient_user_id and m.left_at is null
       and (e.event_type <> 'planned_end' or (
         n.ends_at <= statement_timestamp() and e.event_key = 'planned-end:' || n.id::text || ':' || extract(epoch from n.ends_at)::text
       ))
   ))
   and (e.target_member_id is null or exists (select 1 from public.night_members m where m.id = e.target_member_id and m.left_at is null))
   and case e.event_type
     when 'group_attention' then coalesce((select group_attention_enabled from public.notification_preferences where user_id = e.recipient_user_id), true)
     when 'direct_checkin' then coalesce((select direct_checkins_enabled from public.notification_preferences where user_id = e.recipient_user_id), true)
     when 'personal_pace' then coalesce((select personal_pace_enabled from public.notification_preferences where user_id = e.recipient_user_id), false)
     when 'planned_end' then coalesce((select planned_end_enabled from public.notification_preferences where user_id = e.recipient_user_id), false)
     when 'periodic_water' then coalesce((select periodic_water_enabled from public.notification_preferences where user_id = e.recipient_user_id), false)
     else false end;
$$;
revoke all on function private.notification_is_current(public.notification_events) from public, anon, authenticated;

create or replace function public.can_display_notification(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.notification_events e where e.id = p_event_id
   and e.recipient_user_id = auth.uid() and e.acknowledged_at is null and private.notification_is_current(e));
$$;
revoke all on function public.can_display_notification(uuid) from public, anon;
grant execute on function public.can_display_notification(uuid) to authenticated;

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
  -- Plan-reached remains a private night warning, not a planned-end reminder.
  if new.type not in ('personal_pace', 'group_check_in') then return new; end if;
  if new.expires_at is not null and new.expires_at <= clock_timestamp() then return new; end if;
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
  elsif new.type = 'personal_pace' then
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

create or replace function private.process_due_notification_events(p_user_id uuid default null)
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
      and (p_user_id is null or s.user_id = p_user_id)
    order by s.next_due_at, s.id
    for update of s skip locked
  loop
    if v_schedule.status <> 'active' or not exists (
      select 1 from public.night_members m where m.night_id = v_schedule.night_id
        and m.user_id = v_schedule.user_id and m.left_at is null
    ) then
      delete from public.notification_schedules where id = v_schedule.id;
      continue;
    end if;
    if v_schedule.kind = 'planned_end' then
      if v_schedule.ends_at > v_now then
        update public.notification_schedules set next_due_at = v_schedule.ends_at where id = v_schedule.id;
        continue;
      end if;
      if v_schedule.ends_at <= v_now - interval '2 hours' then
        delete from public.notification_schedules where id = v_schedule.id;
        continue;
      end if;
      select coalesce(p.planned_end_enabled, false) into v_enabled
      from public.notification_preferences p where p.user_id = v_schedule.user_id;
      if not coalesce(v_enabled, false) then
        delete from public.notification_schedules where id = v_schedule.id;
        continue;
      end if;
      perform private.insert_notification_event(
        'planned-end:' || v_schedule.night_id::text || ':' || extract(epoch from v_schedule.ends_at)::text,
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

create or replace function private.create_due_notification_events()
returns void language sql security definer set search_path = '' as $$
  select private.process_due_notification_events(null);
$$;
revoke all on function private.process_due_notification_events(uuid) from public, anon, authenticated;

create or replace function public.get_my_notification_events(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.process_due_notification_events(v_actor);
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
      where e.recipient_user_id = v_actor and private.notification_is_current(e)
        and (e.expires_at is null or e.expires_at > clock_timestamp())
      order by e.created_at desc, e.id
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) rows
  ), '[]'::jsonb);
end;
$$;

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
    if v_planned_end and not exists (
      select 1 from public.notification_events e where e.recipient_user_id = p_user_id
        and e.event_key = 'planned-end:' || v_night.id::text || ':' || extract(epoch from v_night.ends_at)::text
    ) then
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
  join public.push_subscriptions s on s.user_id = e.recipient_user_id and s.disabled_at is null and (s.expiration_time is null or s.expiration_time > clock_timestamp())
  left join public.nights n on n.id = e.night_id
  left join public.notification_preferences p on p.user_id = e.recipient_user_id
  left join public.night_members recipient_member
    on recipient_member.night_id = e.night_id
   and recipient_member.user_id = e.recipient_user_id
   and recipient_member.left_at is null
  left join public.night_members target_member
    on target_member.id = e.target_member_id
   and target_member.left_at is null
  where e.acknowledged_at is null and private.notification_is_current(e)
    and e.created_at > clock_timestamp() - interval '24 hours'
    and (e.expires_at is null or e.expires_at > clock_timestamp())
    and s.user_id = e.recipient_user_id
    and (e.night_id is null or (n.status = 'active' and recipient_member.id is not null))
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
      d.attempts + 1 as attempt,
      s.endpoint,
      s.p256dh,
      s.auth,
      e.id as event_id,
      e.category,
      e.deep_link,
      case when e.category = 'direct_checkin' then 'Someone checked in on you.'
           when e.category = 'group_attention' then 'A group attention update is available.'
           else 'You have a DWD reminder.' end as push_body
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    join public.push_subscriptions s on s.id = d.subscription_id
    left join public.nights n on n.id = e.night_id
  left join public.notification_preferences p on p.user_id = e.recipient_user_id
    left join public.night_members recipient_member
      on recipient_member.night_id = e.night_id
     and recipient_member.user_id = e.recipient_user_id
     and recipient_member.left_at is null
    left join public.night_members target_member
      on target_member.id = e.target_member_id
     and target_member.left_at is null
    where (d.status in ('queued', 'failed') or (d.status = 'sending' and d.next_attempt_at <= clock_timestamp()))
      and d.attempts < 5
      and d.next_attempt_at <= clock_timestamp()
      and s.disabled_at is null and (s.expiration_time is null or s.expiration_time > clock_timestamp())
      and e.acknowledged_at is null and private.notification_is_current(e)
      and e.created_at > clock_timestamp() - interval '24 hours'
      and (e.expires_at is null or e.expires_at > clock_timestamp())
      and s.user_id = e.recipient_user_id
    and (e.night_id is null or (n.status = 'active' and recipient_member.id is not null))
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
    set status = 'sending', attempts = attempts + 1, next_attempt_at = clock_timestamp() + interval '2 minutes'
    where id = v_job.delivery_id;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'deliveryId', v_job.delivery_id,
      'attempt', v_job.attempt,
      'endpoint', v_job.endpoint,
      'p256dh', v_job.p256dh,
      'auth', v_job.auth,
      'body', v_job.push_body,
      'url', v_job.deep_link,
      'eventId', v_job.event_id
    ));
  end loop;
  return v_result;
end;
$$;

drop function if exists public.complete_notification_job(uuid, boolean, boolean, text);
create or replace function public.complete_notification_job(
  p_delivery_id uuid,
  p_delivered boolean,
  p_permanent_failure boolean default false,
  p_error text default null,
  p_attempt integer default null
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
  if v_job.status <> 'sending' or p_attempt is distinct from v_job.attempts then
    return jsonb_build_object('updated', false);
  end if;
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
    set status = 'failed',
        next_attempt_at = v_now + make_interval(mins => least(30, greatest(1, attempts * 2))),
        last_error = left(coalesce(p_error, 'Push delivery failed.'), 500)
    where id = p_delivery_id;
  end if;
  return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.complete_notification_job(uuid, boolean, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.complete_notification_job(uuid, boolean, boolean, text, integer) to service_role;

commit;
