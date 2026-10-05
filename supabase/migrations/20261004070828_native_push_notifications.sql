begin;

-- Draft recovery must find a committed creation even after its planned end.
-- The original RPC validates end time before its duplicate lookup.
create function public.start_night_out_recoverable(p_creation_key uuid, p_title text, p_ends_at timestamptz, p_timezone text, p_host_plan jsonb, p_guests jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_night_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select id into v_night_id from public.nights where host_user_id = auth.uid() and creation_key = p_creation_key;
  if v_night_id is not null then
    return jsonb_build_object('nightId', v_night_id, 'snapshot', private.build_night_snapshot(v_night_id, auth.uid()), 'duplicate', true);
  end if;
  return public.start_night_out(p_creation_key, p_title, p_ends_at, p_timezone, p_host_plan, p_guests);
end $$;
revoke all on function public.start_night_out_recoverable(uuid, text, timestamptz, text, jsonb, jsonb) from public, anon;
grant execute on function public.start_night_out_recoverable(uuid, text, timestamptz, text, jsonb, jsonb) to authenticated;

create table public.native_push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null unique,
  token text not null unique check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' and length(token) <= 256),
  platform text not null check (platform in ('ios', 'android')),
  session_id uuid not null,
  disabled_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.native_notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  subscription_id uuid not null references public.native_push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'discarded')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  receipt_id text,
  receipt_checked_at timestamptz,
  last_error text,
  unique (event_id, subscription_id)
);
create index native_push_user_idx on public.native_push_subscriptions(user_id);
create index native_delivery_subscription_idx on public.native_notification_deliveries(subscription_id);
create index native_delivery_due_idx on public.native_notification_deliveries(status, next_attempt_at);
alter table public.native_push_subscriptions enable row level security;
alter table public.native_notification_deliveries enable row level security;
revoke all on public.native_push_subscriptions, public.native_notification_deliveries from anon, authenticated;
grant all on public.native_push_subscriptions, public.native_notification_deliveries to service_role;

create function public.register_native_push(p_installation_id uuid, p_token text, p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session uuid := (auth.jwt()->>'session_id')::uuid;
begin
  if v_actor is null or v_session is null or not exists (
    select 1 from auth.sessions where id = v_session and user_id = v_actor
  ) then raise exception 'Active sign-in required.' using errcode = '42501'; end if;
  delete from public.native_push_subscriptions
    where (installation_id = p_installation_id or token = p_token)
    and (user_id <> v_actor or token <> p_token or installation_id <> p_installation_id);
  insert into public.native_push_subscriptions(user_id, installation_id, token, platform, session_id)
  values(v_actor, p_installation_id, p_token, p_platform, v_session)
  on conflict (installation_id) do update set session_id = excluded.session_id,
    disabled_at = null, updated_at = clock_timestamp(), platform = excluded.platform;
  return jsonb_build_object('registered', true);
end $$;
create function public.remove_native_push(p_installation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  delete from public.native_push_subscriptions where installation_id = p_installation_id and user_id = auth.uid();
  return jsonb_build_object('removed', true);
end $$;

create function private.native_notification_current(p_event public.notification_events, p_subscription public.native_push_subscriptions)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_subscription.disabled_at is null
    and p_subscription.user_id = p_event.recipient_user_id
    and exists (select 1 from auth.sessions s where s.id = p_subscription.session_id and s.user_id = p_subscription.user_id)
    and not exists (select 1 from public.account_deletions r where r.user_id = p_subscription.user_id)
    and (p_event.event_type <> 'periodic_water' or not exists (
      select 1 from public.notification_preferences p where p.user_id = p_subscription.user_id and p.reminders_muted_until > clock_timestamp()))
    and p_event.acknowledged_at is null and private.notification_is_current(p_event)
    and p_event.created_at > clock_timestamp() - interval '24 hours'
    and (p_event.expires_at is null or p_event.expires_at > clock_timestamp())
    and (p_event.night_id is null or exists (select 1 from public.nights n join public.night_members m on m.night_id = n.id
      where n.id = p_event.night_id and n.status = 'active' and m.user_id = p_event.recipient_user_id and m.left_at is null))
    and (p_event.target_member_id is null or exists (select 1 from public.night_members m where m.id = p_event.target_member_id and m.left_at is null))
    and coalesce((select case
      when p_event.category = 'group_attention' then p.group_attention_enabled
      when p_event.category = 'direct_checkin' then p.direct_checkins_enabled
      when p_event.event_type = 'personal_pace' then p.personal_pace_enabled
      when p_event.event_type = 'planned_end' then p.planned_end_enabled
      when p_event.event_type = 'periodic_water' then p.periodic_water_enabled
      else false end from public.notification_preferences p where p.user_id = p_event.recipient_user_id),
      p_event.category in ('group_attention', 'direct_checkin'));
$$;

create function public.claim_native_notification_jobs(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job record; v_result jsonb := '[]';
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  perform private.create_due_notification_events();
  insert into public.native_notification_deliveries(event_id, subscription_id)
  select e.id, s.id from public.notification_events e join public.native_push_subscriptions s on s.user_id = e.recipient_user_id
  where e.created_at > clock_timestamp() - interval '24 hours'
    and e.acknowledged_at is null and private.native_notification_current(e, s) on conflict do nothing;
  for v_job in select d.id, d.attempts + 1 as attempt, s.token, e.id as event_id, e.recipient_user_id, e.night_id
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
      'token', v_job.token, 'eventId', v_job.event_id, 'recipientUserId', v_job.recipient_user_id, 'nightId', v_job.night_id));
  end loop;
  return v_result;
end $$;

create function public.complete_native_notification_job(p_delivery_id uuid, p_attempt integer, p_receipt_id text default null, p_permanent_failure boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.native_notification_deliveries;
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  select * into v_job from public.native_notification_deliveries where id = p_delivery_id for update;
  if v_job.id is null or v_job.status <> 'sending' or v_job.attempts <> p_attempt then return jsonb_build_object('updated', false); end if;
  update public.native_notification_deliveries set
    status = case when p_receipt_id is not null then 'accepted' when p_permanent_failure or attempts >= 5 then 'discarded' else 'failed' end,
    receipt_id = p_receipt_id, next_attempt_at = clock_timestamp() + interval '1 minute' * power(2, attempts),
    last_error = case when p_receipt_id is null then 'Native delivery failed.' else null end where id = p_delivery_id;
  if p_permanent_failure then update public.native_push_subscriptions set disabled_at = clock_timestamp() where id = v_job.subscription_id; end if;
  return jsonb_build_object('updated', true);
end $$;

create function public.get_native_push_receipts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  update public.native_notification_deliveries set status = 'discarded', receipt_checked_at = clock_timestamp(),
    last_error = 'Push receipt expired.' where status = 'accepted' and next_attempt_at < clock_timestamp() - interval '24 hours';
  select coalesce(jsonb_agg(jsonb_build_object('deliveryId', id, 'receiptId', receipt_id)), '[]') into v_result
  from (select id, receipt_id from public.native_notification_deliveries where status = 'accepted' and receipt_id is not null
    and receipt_checked_at is null and next_attempt_at < clock_timestamp() - interval '15 minutes' order by next_attempt_at limit 100) d;
  return v_result;
end;
$$;
create function public.complete_native_push_receipt(p_delivery_id uuid, p_device_unregistered boolean, p_delivered boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_subscription_id uuid;
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  update public.native_notification_deliveries set receipt_checked_at = clock_timestamp(),
    status = case when p_delivered then 'delivered' else 'discarded' end,
    last_error = case when p_delivered then null else 'Push service rejected delivery.' end where id = p_delivery_id and status = 'accepted'
    returning subscription_id into v_subscription_id;
  -- Expired or already completed receipts cannot disable a re-enabled device.
  if v_subscription_id is null then return; end if;
  if p_device_unregistered then update public.native_push_subscriptions set disabled_at = clock_timestamp()
    where id = v_subscription_id; end if;
end $$;

revoke all on function private.native_notification_current(public.notification_events, public.native_push_subscriptions) from public, anon, authenticated;
revoke all on function public.register_native_push(uuid, text, text), public.remove_native_push(uuid) from public, anon;
grant execute on function public.register_native_push(uuid, text, text), public.remove_native_push(uuid) to authenticated;
revoke all on function public.claim_native_notification_jobs(integer), public.complete_native_notification_job(uuid, integer, text, boolean),
  public.get_native_push_receipts(), public.complete_native_push_receipt(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.claim_native_notification_jobs(integer), public.complete_native_notification_job(uuid, integer, text, boolean),
  public.get_native_push_receipts(), public.complete_native_push_receipt(uuid, boolean, boolean) to service_role;
commit;
