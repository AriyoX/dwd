-- Additive, deliberate migration. Never execute from a Vercel build.
-- Empty plans mean water-only; existing alcohol logging, plan versions, and RLS remain intact.
create or replace function private.validate_plan(p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer;
  v_quick_count integer := 0;
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
    if char_length(btrim(coalesce(v_item ->> 'label', ''))) not between 1 and 60 then
      raise exception 'Plan item label is invalid.' using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'category', '') not in ('beer', 'wine', 'spirit', 'cocktail', 'other') then
      raise exception 'Plan item category is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'volumeMl')::numeric not between 1 and 2000 then
      raise exception 'Plan item volume is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'abvPercent')::numeric <= 0
      or (v_item ->> 'abvPercent')::numeric > 95 then
      raise exception 'Plan item ABV is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'plannedQuantity')::integer not between 1 and 50 then
      raise exception 'Plan item quantity is invalid.' using errcode = '22023';
    end if;
    if coalesce((v_item ->> 'isQuickLog')::boolean, false) then
      v_quick_count := v_quick_count + 1;
    end if;
  end loop;

  if v_count > 0 and v_quick_count <> 1 then
    raise exception 'Choose exactly one quick-log item.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_night_invite(
  p_night_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer default null
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
  v_invite_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token hash is invalid.' using errcode = '22023'; end if;
  if p_expires_at <= v_now or p_expires_at > v_now + interval '7 days' then
    raise exception 'Invite expiry is invalid.' using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100 then
    raise exception 'Invite use limit is invalid.' using errcode = '22023';
  end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or v_night.status <> 'active'
    or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;


  select i.id into v_invite_id from public.night_invites i
  where i.night_id = p_night_id and i.token_hash = p_token_hash and i.created_by = v_actor;
  if found then
    if exists (select 1 from public.night_invites i where i.id = v_invite_id and (i.revoked_at is not null or i.expires_at <= v_now)) then
      raise exception 'This invitation request is no longer active. Create a new request.' using errcode = '55000';
    end if;
    return (select jsonb_build_object('inviteId', i.id, 'expiresAt', i.expires_at) from public.night_invites i where i.id = v_invite_id);
  end if;

  insert into public.night_invites (
    night_id, token_hash, created_by, expires_at, max_uses, created_at
  ) values (
    p_night_id, p_token_hash, v_actor, p_expires_at, p_max_uses, v_now
  ) returning id into v_invite_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    p_night_id, v_actor, 'invite.created', 'night_invite', v_invite_id,
    jsonb_build_object('expires_at', p_expires_at, 'max_uses', p_max_uses), v_now
  );
  return jsonb_build_object('inviteId', v_invite_id, 'expiresAt', p_expires_at);
end;
$$;

create or replace function public.rotate_night_invite(
  p_night_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer default null
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
  v_invite_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token hash is invalid.' using errcode = '22023'; end if;
  if p_expires_at <= v_now or p_expires_at > v_now + interval '7 days' then
    raise exception 'Invite expiry is invalid.' using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100 then
    raise exception 'Invite use limit is invalid.' using errcode = '22023';
  end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or v_night.status <> 'active'
    or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;


  select i.id into v_invite_id from public.night_invites i
  where i.night_id = p_night_id and i.token_hash = p_token_hash and i.created_by = v_actor;
  if found then
    if exists (select 1 from public.night_invites i where i.id = v_invite_id and (i.revoked_at is not null or i.expires_at <= v_now)) then
      raise exception 'This invitation request is no longer active. Create a new request.' using errcode = '55000';
    end if;
    return (select jsonb_build_object('inviteId', i.id, 'expiresAt', i.expires_at) from public.night_invites i where i.id = v_invite_id);
  end if;

  update public.night_invites set revoked_at = v_now
  where night_id = p_night_id and revoked_at is null;
  insert into public.night_invites (
    night_id, token_hash, created_by, expires_at, max_uses, created_at
  ) values (
    p_night_id, p_token_hash, v_actor, p_expires_at, p_max_uses, v_now
  ) returning id into v_invite_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    p_night_id, v_actor, 'invite.rotated', 'night_invite', v_invite_id,
    jsonb_build_object('expires_at', p_expires_at, 'max_uses', p_max_uses), v_now
  );
  return jsonb_build_object('inviteId', v_invite_id, 'expiresAt', p_expires_at);
end;
$$;

-- No access rules on existing nights, members, logs, alerts, or profiles are widened.
create index nights_finished_history_idx on public.nights (ended_at desc, id) where status = 'ended';

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  request_key uuid not null,
  kind text not null check (kind in ('feedback', 'problem', 'deletion')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'completed')),
  response text check (response is null or char_length(response) <= 4000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint support_requests_account_request_unique unique (user_id, request_key)
);
create index support_requests_user_created_idx on public.support_requests (user_id, created_at desc);
create unique index support_requests_one_open_deletion on public.support_requests (user_id)
  where kind = 'deletion' and status <> 'completed';
alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon, authenticated;
grant select on public.support_requests to authenticated;
create policy support_requests_select_own on public.support_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create trigger support_requests_set_updated_at before update on public.support_requests
  for each row execute function private.set_updated_at();

-- A narrow transaction boundary enforces ownership, idempotency and rate limits.
-- Browser roles have no direct INSERT/UPDATE/DELETE privileges on this table.
create or replace function private.submit_support_request(p_request_key uuid, p_kind text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_key is null or p_kind is null or p_kind not in ('feedback', 'problem', 'deletion')
    or p_message is null or char_length(btrim(p_message)) not between 10 and 4000 then
    raise exception 'Check request details.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = v_actor for update;
  if not found then raise exception 'Account unavailable.' using errcode = '42501'; end if;
  select id into v_id from public.support_requests where user_id = v_actor and request_key = p_request_key;
  if found then return v_id; end if;
  if p_kind = 'deletion' then
    select id into v_id from public.support_requests where user_id = v_actor and kind = 'deletion' and status <> 'completed';
    if found then return v_id; end if;
  end if;
  if (select count(*) from public.support_requests where user_id = v_actor and created_at > clock_timestamp() - interval '24 hours') >= 10 then
    raise exception 'Request limit reached. Try tomorrow.' using errcode = '54000';
  end if;
  insert into public.support_requests (user_id, request_key, kind, message)
    values (v_actor, p_request_key, p_kind, btrim(p_message)) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.submit_support_request(uuid, text, text) from public, anon;
grant execute on function private.submit_support_request(uuid, text, text) to authenticated;
create or replace function public.submit_support_request(p_request_key uuid, p_kind text, p_message text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.submit_support_request(p_request_key, p_kind, p_message);
$$;
revoke execute on function public.submit_support_request(uuid, text, text) from public, anon;
grant execute on function public.submit_support_request(uuid, text, text) to authenticated;

-- Preserve queued alcohol entered before switching to water-only. Validate the plan at consumption time.
create or replace function public.log_drink(
  p_target_member_id uuid,
  p_plan_item_id uuid default null,
  p_custom_drink jsonb default null,
  p_consumed_at timestamptz default null,
  p_idempotency_key uuid default null,
  p_ack_plan_exceeded boolean default false,
  p_ack_after_end boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_target public.night_members%rowtype;
  v_actor_member public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_plan_item public.drink_plan_items%rowtype;
  v_existing public.drink_logs%rowtype;
  v_log public.drink_logs%rowtype;
  v_label text;
  v_category text;
  v_volume numeric;
  v_abv numeric;
  v_ethanol numeric;
  v_plan_total numeric;
  v_logged_total numeric;
  v_projected_total numeric;
  v_applicable_end timestamptz;
  v_after_end boolean;
  v_plan_exceeded boolean;
  v_warnings jsonb := '[]'::jsonb;
  v_personal_total numeric;
  v_group_total numeric;
  v_alerts jsonb;
  v_plan_revision text;
begin
  if v_actor is null then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'unauthenticated', 'message', 'Sign in again to sync this log.'
    );
  end if;
  if p_idempotency_key is null or p_consumed_at is null then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'invalid_input', 'message', 'This log is missing required information.'
    );
  end if;

  select * into v_existing
  from public.drink_logs
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'status', 'duplicate', 'log', private.drink_log_json(v_existing), 'alerts', '[]'::jsonb
    );
  end if;

  if p_consumed_at > v_now + interval '5 minutes' then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'future_time', 'message', 'The drink time is too far in the future.'
    );
  end if;
  if p_consumed_at < v_now - interval '7 days' then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'too_old', 'message', 'This queued log is too old to sync.'
    );
  end if;

  select * into v_target from public.night_members where id = p_target_member_id for update;
  if not found then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'member_unavailable', 'message', 'This participant is no longer available.'
    );
  end if;
  select * into v_night from public.nights where id = v_target.night_id for update;
  if p_consumed_at < v_night.starts_at then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'before_night', 'message', 'The drink time is before this night began.'
    );
  end if;

  select * into v_actor_member
  from public.night_members
  where night_id = v_night.id
    and user_id = v_actor
    and member_type = 'account'
    and joined_at <= p_consumed_at
    and (left_at is null or p_consumed_at <= left_at);
  if not found or (v_night.status = 'active' and v_actor_member.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;
  if not (
    (
      v_target.member_type = 'account'
      and v_target.user_id = v_actor
      and v_target.joined_at <= p_consumed_at
      and (v_target.left_at is null or p_consumed_at <= v_target.left_at)
    )
    or (
      v_target.member_type = 'guest'
      and v_target.managed_by_user_id = v_actor
      and v_night.host_user_id = v_actor
      and v_target.joined_at <= p_consumed_at
      and (v_target.left_at is null or p_consumed_at <= v_target.left_at)
    )
  ) or (v_night.status = 'active' and v_target.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;

  if v_night.status = 'ended' then
    if p_consumed_at > v_night.ended_at then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'after_actual_end', 'message', 'This entry occurred after the night was ended.'
      );
    end if;
    if v_now > v_night.ended_at + interval '24 hours' then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'post_end_grace_expired', 'message', 'The 24-hour post-end sync period has expired.'
      );
    end if;
  end if;

  if not exists (
    select 1 from public.drink_plan_items p
    where p.night_member_id = v_target.id and p.created_at <= p_consumed_at
      and (p.archived_at is null or p_consumed_at <= p.archived_at)
  ) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'plan_required', 'message', 'Create a personal plan before logging alcohol.'
    );
  end if;

  if p_plan_item_id is not null then
    if p_custom_drink is not null then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'mixed_drink_input', 'message', 'Choose either a plan item or a custom drink.'
      );
    end if;
    select * into v_plan_item
    from public.drink_plan_items p
    where p.id = p_plan_item_id and p.night_member_id = v_target.id;
    if not found
      or v_plan_item.created_at > p_consumed_at
      or (v_plan_item.archived_at is not null and p_consumed_at > v_plan_item.archived_at) then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'plan_version_unavailable', 'message', 'The selected plan version was not valid at that time.'
      );
    end if;
    v_label := v_plan_item.label;
    v_category := v_plan_item.category;
    v_volume := v_plan_item.volume_ml;
    v_abv := v_plan_item.abv_percent;
  else
    if p_custom_drink is null or jsonb_typeof(p_custom_drink) <> 'object' then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'drink_required', 'message', 'Choose a drink to log.'
      );
    end if;
    v_label := btrim(coalesce(p_custom_drink ->> 'label', ''));
    v_category := coalesce(p_custom_drink ->> 'category', '');
    begin
      v_volume := (p_custom_drink ->> 'volume_ml')::numeric;
      v_abv := (p_custom_drink ->> 'abv_percent')::numeric;
    exception when others then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'invalid_custom_drink', 'message', 'The custom drink details are invalid.'
      );
    end;
    if char_length(v_label) not between 1 and 60
      or v_category not in ('beer', 'wine', 'spirit', 'cocktail', 'other')
      or v_volume not between 1 and 2000
      or v_abv <= 0 or v_abv > 95 then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'invalid_custom_drink', 'message', 'The custom drink details are invalid.'
      );
    end if;
  end if;

  v_ethanol := round(v_volume * (v_abv / 100.0) * 0.789, 3);
  select coalesce(sum(round(p.volume_ml * (p.abv_percent / 100.0) * 0.789, 3) * p.planned_quantity), 0)
  into v_plan_total
  from public.drink_plan_items p
  where p.night_member_id = v_target.id and p.archived_at is null;
  select coalesce(sum(d.ethanol_grams), 0) into v_logged_total
  from public.drink_logs d
  where d.night_member_id = v_target.id and d.deleted_at is null;
  v_projected_total := v_logged_total + v_ethanol;
  v_plan_exceeded := v_projected_total > v_plan_total + 0.01;
  v_applicable_end := private.applicable_end_at(v_night.id, v_night.initial_ends_at, p_consumed_at);
  v_after_end := p_consumed_at > v_applicable_end;

  if v_plan_exceeded and not p_ack_plan_exceeded then
    v_warnings := v_warnings || jsonb_build_array('plan_exceeded');
  end if;
  if v_after_end and not p_ack_after_end then
    v_warnings := v_warnings || jsonb_build_array('after_end');
  end if;
  if jsonb_array_length(v_warnings) > 0 then
    return jsonb_build_object(
      'status', 'confirmation_required',
      'warnings', v_warnings,
      'message', case
        when jsonb_array_length(v_warnings) = 2 then 'This is beyond your plan and your planned night has ended. Log it anyway?'
        when v_warnings ? 'plan_exceeded' then 'This is beyond the plan you set earlier. Log it anyway?'
        else 'Your planned night has ended. Log this drink anyway?'
      end
    );
  end if;

  begin
    insert into public.drink_logs (
      night_id,
      night_member_id,
      actor_user_id,
      plan_item_id,
      label_snapshot,
      category_snapshot,
      volume_ml,
      abv_percent,
      consumed_at,
      created_at,
      after_end,
      idempotency_key
    ) values (
      v_night.id,
      v_target.id,
      v_actor,
      p_plan_item_id,
      v_label,
      v_category,
      v_volume,
      v_abv,
      p_consumed_at,
      v_now,
      v_after_end,
      p_idempotency_key
    ) returning * into v_log;
  exception when unique_violation then
    select * into v_existing
    from public.drink_logs
    where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'status', 'duplicate', 'log', private.drink_log_json(v_existing), 'alerts', '[]'::jsonb
      );
    end if;
    raise;
  end;

  if p_consumed_at <= v_now and v_now - p_consumed_at <= interval '15 minutes' then
    select coalesce(sum(d.ethanol_grams), 0) into v_personal_total
    from public.drink_logs d
    where d.night_member_id = v_target.id
      and d.deleted_at is null
      and d.consumed_at between p_consumed_at - interval '60 minutes' and p_consumed_at;
    if v_personal_total >= 20 and not exists (
      select 1 from public.night_alerts a
      where a.night_member_id = v_target.id
        and a.type = 'personal_pace'
        and a.created_at > v_now - interval '60 minutes'
    ) then
      insert into public.night_alerts (
        night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
        expires_at
      ) values (
        v_night.id,
        v_target.id,
        'personal_pace',
        'caution',
        'private',
        'You have logged drinks fairly quickly. Consider pausing, drinking water and checking how you feel.',
        'personal_pace:' || v_target.id || ':' || floor(extract(epoch from v_now) / 3600)::bigint,
        v_now,
        v_now + interval '60 minutes'
      ) on conflict (dedupe_key) do nothing;
    end if;

    select coalesce(sum(d.ethanol_grams), 0) into v_group_total
    from public.drink_logs d
    where d.night_member_id = v_target.id
      and d.deleted_at is null
      and d.consumed_at between p_consumed_at - interval '120 minutes' and p_consumed_at;
    if v_group_total >= 40 and not exists (
      select 1 from public.night_alerts a
      where a.night_member_id = v_target.id
        and a.type = 'group_check_in'
        and a.created_at > v_now - interval '120 minutes'
    ) then
      insert into public.night_alerts (
        night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
        expires_at
      ) values (
        v_night.id,
        v_target.id,
        'group_check_in',
        'caution',
        'group',
        v_target.display_name || ' has logged several drinks in a short period. Please check in with them.',
        'group_check_in:' || v_target.id || ':' || floor(extract(epoch from v_now) / 7200)::bigint,
        v_now,
        v_now + interval '120 minutes'
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;

  if abs(v_projected_total - v_plan_total) <= 0.01 then
    select coalesce(max(p.created_at)::text, '0') into v_plan_revision
    from public.drink_plan_items p
    where p.night_member_id = v_target.id and p.archived_at is null;
    insert into public.night_alerts (
      night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
      expires_at
    ) values (
      v_night.id,
      v_target.id,
      'plan_reached',
      'caution',
      'private',
      'You have reached your personal plan. Consider stopping here.',
      'plan_reached:' || v_target.id || ':' || v_plan_revision,
      v_now,
      null
    ) on conflict (dedupe_key) do nothing;
  end if;

  select coalesce(jsonb_agg(private.alert_json(a) order by a.created_at), '[]'::jsonb)
  into v_alerts
  from public.night_alerts a
  where a.night_member_id = v_target.id and a.created_at = v_now;

  return jsonb_build_object(
    'status', 'created', 'log', private.drink_log_json(v_log), 'alerts', v_alerts
  );
end;
$$;

-- Remember completed revocations so a lost response cannot revoke a later link on retry.
create table private.invite_revocations (
  user_id uuid not null references public.profiles(id),
  request_key text not null check (request_key ~ '^[0-9a-f]{64}$'),
  night_id uuid not null references public.nights(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_key)
);
create index invite_revocations_night_idx on private.invite_revocations(night_id);
alter table private.invite_revocations enable row level security;
revoke all on private.invite_revocations from public, anon, authenticated;
create or replace function private.revoke_invite_once(p_night_id uuid, p_request_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_key is null or p_request_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request.' using errcode = '22023'; end if;
  perform 1 from public.nights where id = p_night_id and host_user_id = v_actor for update;
  if not found then raise exception 'Night not found.' using errcode = '42501'; end if;
  if exists (select 1 from private.invite_revocations where user_id = v_actor and request_key = p_request_key and night_id = p_night_id) then return jsonb_build_object('revoked', true); end if;
  v_result := public.revoke_night_invite(p_night_id);
  insert into private.invite_revocations(user_id, request_key, night_id) values (v_actor, p_request_key, p_night_id);
  return v_result;
end;
$$;
revoke execute on function private.revoke_invite_once(uuid, text) from public, anon;
grant execute on function private.revoke_invite_once(uuid, text) to authenticated;
create or replace function public.revoke_night_invite_once(p_night_id uuid, p_request_key text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.revoke_invite_once(p_night_id, p_request_key);
$$;
revoke execute on function public.revoke_night_invite_once(uuid, text) from public, anon;
grant execute on function public.revoke_night_invite_once(uuid, text) to authenticated;
