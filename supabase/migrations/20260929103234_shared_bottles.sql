-- Shared bottles are changed only through authenticated, membership-checked RPCs.
create table public.shared_bottles (
  id uuid primary key,
  night_id uuid not null references public.nights(id) on delete cascade,
  creator_member_id uuid references public.night_members(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  category text not null check (category in ('beer','wine','spirit','cocktail','other')),
  volume_ml numeric not null check (volume_ml between 1 and 10000),
  abv_percent numeric not null check (abv_percent between 0.1 and 95),
  pour_ml numeric not null check (pour_ml between 1 and 2000 and pour_ml <= volume_ml),
  access text not null check (access in ('everyone','selected')),
  allowed_member_ids uuid[] not null default '{}',
  joined_member_ids uuid[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz
);
create index shared_bottles_night_idx on public.shared_bottles(night_id);
create index shared_bottles_creator_idx on public.shared_bottles(creator_member_id);
alter table public.shared_bottles enable row level security;
revoke all on public.shared_bottles from anon, authenticated;
grant select on public.shared_bottles to authenticated;
alter table public.drink_plan_items add column shared_bottle_id uuid references public.shared_bottles(id) on delete set null;
alter table public.drink_logs add column shared_bottle_id uuid references public.shared_bottles(id) on delete set null;
create index drink_plan_bottle_idx on public.drink_plan_items(shared_bottle_id) where shared_bottle_id is not null;
create index drink_logs_bottle_idx on public.drink_logs(shared_bottle_id) where shared_bottle_id is not null;

create or replace function private.can_view_bottle(p_bottle_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id = auth.uid() and exists (
    select 1 from public.shared_bottles b
    join public.night_members actor on actor.night_id = b.night_id
      and actor.user_id = p_user_id and actor.left_at is null
    where b.id = p_bottle_id and (
      b.access = 'everyone' or actor.id = b.creator_member_id or actor.id = any(b.allowed_member_ids)
      or exists (select 1 from public.night_members guest where guest.night_id = b.night_id
        and guest.managed_by_user_id = p_user_id and guest.left_at is null and guest.id = any(b.allowed_member_ids))
    )
  );
$$;
revoke all on function private.can_view_bottle(uuid, uuid) from public, anon;
grant execute on function private.can_view_bottle(uuid, uuid) to authenticated;
create policy shared_bottles_read on public.shared_bottles for select to authenticated
  using (private.can_view_bottle(id, (select auth.uid())));
alter publication supabase_realtime add table public.shared_bottles;

create or replace function private.shared_bottles_json(p_night_id uuid, p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'nightId', b.night_id, 'creatorMemberId', b.creator_member_id,
    'label', b.label, 'category', b.category, 'volumeMl', b.volume_ml,
    'abvPercent', b.abv_percent, 'pourMl', b.pour_ml, 'access', b.access,
    'allowedMemberIds', to_jsonb(b.allowed_member_ids),
    'joinedMemberIds', to_jsonb(b.joined_member_ids), 'closedAt', b.closed_at,
    'remainingMl', b.volume_ml - coalesce((select sum(d.volume_ml) from public.drink_logs d
      where d.shared_bottle_id = b.id and d.deleted_at is null), 0)
  ) order by b.created_at, b.id), '[]'::jsonb)
  from public.shared_bottles b where b.night_id = p_night_id and private.can_view_bottle(b.id, p_user_id);
$$;
revoke all on function private.shared_bottles_json(uuid, uuid) from public, anon, authenticated;

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
    'sharedBottles', private.shared_bottles_json(p_night_id, p_user_id),
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
              'sharedBottleId', p.shared_bottle_id,
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

create or replace function private.drink_log_json(p_log public.drink_logs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_log.id,
    'nightId', p_log.night_id,
    'nightMemberId', p_log.night_member_id,
    'actorUserId', p_log.actor_user_id,
    'planItemId', p_log.plan_item_id,
    'sharedBottleId', p_log.shared_bottle_id,
    'labelSnapshot', p_log.label_snapshot,
    'categorySnapshot', p_log.category_snapshot,
    'volumeMl', p_log.volume_ml,
    'abvPercent', p_log.abv_percent,
    'ethanolGrams', p_log.ethanol_grams,
    'consumedAt', p_log.consumed_at,
    'createdAt', p_log.created_at,
    'afterEnd', p_log.after_end,
    'idempotencyKey', p_log.idempotency_key,
    'deletedAt', p_log.deleted_at
  );
$$;

create or replace function private.insert_plan(
  p_member_id uuid,
  p_actor_user_id uuid,
  p_plan jsonb,
  p_created_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_bottle public.shared_bottles%rowtype;
begin
  perform private.validate_plan(p_plan);
  for v_item in select value from jsonb_array_elements(p_plan)
  loop
    if nullif(v_item ->> 'sharedBottleId', '') is not null then
      select b.* into v_bottle from public.shared_bottles b
      join public.night_members m on m.night_id = b.night_id
      where b.id = (v_item ->> 'sharedBottleId')::uuid and m.id = p_member_id
        and m.left_at is null and m.id = any(b.joined_member_ids) and b.closed_at is null;
      if not found then raise exception 'Join this bottle before adding it to your plan.' using errcode = '22023'; end if;
      if v_item ->> 'label' <> v_bottle.label or v_item ->> 'category' <> v_bottle.category
        or (v_item ->> 'abvPercent')::numeric <> v_bottle.abv_percent
        or (v_item ->> 'volumeMl')::numeric > v_bottle.volume_ml then
        raise exception 'Bottle details changed. Choose the bottle again.' using errcode = '22023';
      end if;
    end if;
    insert into public.drink_plan_items (
      shared_bottle_id,
      night_member_id,
      label,
      category,
      volume_ml,
      abv_percent,
      planned_quantity,
      is_quick_log,
      created_by,
      created_at,
      updated_at
    ) values (
      nullif(v_item ->> 'sharedBottleId', '')::uuid,
      p_member_id,
      btrim(v_item ->> 'label'),
      v_item ->> 'category',
      (v_item ->> 'volumeMl')::numeric,
      (v_item ->> 'abvPercent')::numeric,
      (v_item ->> 'plannedQuantity')::integer,
      (v_item ->> 'isQuickLog')::boolean,
      p_actor_user_id,
      p_created_at,
      p_created_at
    );
  end loop;
end;
$$;

create or replace function public.create_shared_bottle(p_night_id uuid, p_bottle jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_member uuid; v_id uuid; v_allowed uuid[]; v_existing public.shared_bottles%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select id into v_member from public.night_members where night_id = p_night_id and user_id = v_actor and left_at is null;
  if v_member is null then raise exception 'Bottle unavailable.' using errcode = '42501'; end if;
  -- Match plan/log lock order: member, night, bottle.
  perform 1 from public.night_members where id = v_member for update;
  perform 1 from public.nights where id = p_night_id and status = 'active' for update;
  if not found then raise exception 'This night has ended.' using errcode = '55000'; end if;
  v_id := (p_bottle ->> 'id')::uuid;
  select * into v_existing from public.shared_bottles where id = v_id;
  if found then
    if v_existing.creator_member_id is distinct from v_member or v_existing.night_id <> p_night_id then
      raise exception 'Bottle unavailable.' using errcode = '42501';
    end if;
    return private.build_night_snapshot(p_night_id, v_actor);
  end if;
  select coalesce(array_agg(distinct value::uuid), '{}') into v_allowed
    from jsonb_array_elements_text(p_bottle -> 'allowedMemberIds');
  if cardinality(v_allowed) > 100 or exists (
    select 1 from unnest(v_allowed) chosen where not exists (
      select 1 from public.night_members where id = chosen and night_id = p_night_id and left_at is null
    )
  ) then raise exception 'Choose people from this night.' using errcode = '22023'; end if;
  if not (v_member = any(v_allowed)) then v_allowed := array_append(v_allowed, v_member); end if;
  insert into public.shared_bottles(id, night_id, creator_member_id, label, category, volume_ml, abv_percent, pour_ml, access, allowed_member_ids, joined_member_ids)
  values(v_id, p_night_id, v_member, btrim(p_bottle ->> 'label'), p_bottle ->> 'category',
    (p_bottle ->> 'volumeMl')::numeric, (p_bottle ->> 'abvPercent')::numeric, (p_bottle ->> 'pourMl')::numeric,
    p_bottle ->> 'access', case when p_bottle ->> 'access' = 'everyone' then '{}'::uuid[] else v_allowed end, array[v_member]);
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

create or replace function public.set_shared_bottle_membership(p_bottle_id uuid, p_member_id uuid, p_join boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_member public.night_members%rowtype; v_bottle public.shared_bottles%rowtype;
begin
  if v_actor is null or p_join is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found or v_member.left_at is not null or not private.is_current_night_member(v_member.night_id, v_actor)
    or not (coalesce(v_member.user_id = v_actor, false) or private.can_manage_member(p_member_id, v_actor)) then
    raise exception 'Bottle unavailable.' using errcode = '42501';
  end if;
  perform 1 from public.nights where id = v_member.night_id and status = 'active' for update;
  if not found then raise exception 'This night has ended.' using errcode = '55000'; end if;
  select * into v_bottle from public.shared_bottles where id = p_bottle_id and night_id = v_member.night_id for update;
  if not found or v_bottle.closed_at is not null then raise exception 'Bottle unavailable.' using errcode = '42501'; end if;
  if v_bottle.access = 'selected' and not (p_member_id = any(v_bottle.allowed_member_ids)) then
    raise exception 'This bottle is for selected people.' using errcode = '42501';
  end if;
  if not p_join and exists (select 1 from public.drink_plan_items where night_member_id = p_member_id
    and shared_bottle_id = p_bottle_id and archived_at is null) then
    raise exception 'Remove this bottle from your plan before leaving.' using errcode = '22023';
  end if;
  update public.shared_bottles set joined_member_ids = case
    when p_join and not (p_member_id = any(joined_member_ids)) then array_append(joined_member_ids, p_member_id)
    when not p_join then array_remove(joined_member_ids, p_member_id) else joined_member_ids end
  where id = p_bottle_id;
  return private.build_night_snapshot(v_member.night_id, v_actor);
end;
$$;

create or replace function public.close_shared_bottle(p_bottle_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_bottle public.shared_bottles%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select b.* into v_bottle from public.shared_bottles b join public.night_members m on m.id = b.creator_member_id
    where b.id = p_bottle_id and m.user_id = v_actor and m.left_at is null;
  if not found then raise exception 'Only the person sharing this bottle can put it away.' using errcode = '42501'; end if;
  perform 1 from public.night_members where id = v_bottle.creator_member_id for update;
  perform 1 from public.nights where id = v_bottle.night_id and status = 'active' for update;
  if not found then raise exception 'This night has ended.' using errcode = '55000'; end if;
  update public.shared_bottles set closed_at = coalesce(closed_at, clock_timestamp()) where id = p_bottle_id;
  return private.build_night_snapshot(v_bottle.night_id, v_actor);
end;
$$;

create or replace function private.log_drink_without_bottle(
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

revoke all on function private.log_drink_without_bottle(uuid, uuid, jsonb, timestamptz, uuid, boolean, boolean) from public, anon, authenticated;

create or replace function public.log_drink(
  p_target_member_id uuid, p_plan_item_id uuid default null, p_custom_drink jsonb default null,
  p_consumed_at timestamptz default null, p_idempotency_key uuid default null,
  p_ack_plan_exceeded boolean default false, p_ack_after_end boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_member public.night_members%rowtype;
  v_bottle_id uuid; v_bottle public.shared_bottles%rowtype; v_volume numeric;
  v_result jsonb; v_custom jsonb := p_custom_drink; v_log public.drink_logs%rowtype; v_remaining numeric;
begin
  if v_actor is null then return jsonb_build_object('status','permanently_rejected','code','unauthenticated','message','Sign in again to log a drink.'); end if;
  -- Serialize against the existing plan and logging paths before locking the bottle.
  select * into v_member from public.night_members where id = p_target_member_id for update;
  if found then perform 1 from public.nights where id = v_member.night_id for update; end if;
  -- A retry succeeds even when its earlier pour emptied or closed the bottle.
  select * into v_log from public.drink_logs where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('status','duplicate','log',private.drink_log_json(v_log),'alerts','[]'::jsonb); end if;
  if p_plan_item_id is not null then
    select shared_bottle_id, volume_ml into v_bottle_id, v_volume from public.drink_plan_items
      where id = p_plan_item_id and night_member_id = p_target_member_id;
  elsif p_custom_drink ->> 'shared_bottle_id' is not null then
    begin
      v_bottle_id := (p_custom_drink ->> 'shared_bottle_id')::uuid;
      v_volume := (p_custom_drink ->> 'volume_ml')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('status','permanently_rejected','code','invalid_bottle','message','Check the bottle and pour size.');
    end;
  end if;
  if v_bottle_id is not null then
    if not private.is_current_night_member(v_member.night_id, v_actor)
      or not (coalesce(v_member.user_id = v_actor, false) or private.can_manage_member(p_target_member_id, v_actor)) then
      return jsonb_build_object('status','permanently_rejected','code','permission_denied','message','You cannot log for this person.');
    end if;
    select * into v_bottle from public.shared_bottles where id = v_bottle_id and night_id = v_member.night_id for update;
    if not found or v_bottle.closed_at is not null or not (p_target_member_id = any(v_bottle.joined_member_ids)) then
      return jsonb_build_object('status','permanently_rejected','code','bottle_unavailable','message','Join an available bottle before logging a pour.');
    end if;
    if v_volume is null or not (v_volume between 1 and 2000) then
      return jsonb_build_object('status','permanently_rejected','code','invalid_pour','message','Enter a pour size between 1 and 2000 ml.');
    end if;
    select v_bottle.volume_ml - coalesce(sum(volume_ml), 0) into v_remaining from public.drink_logs
      where shared_bottle_id = v_bottle.id and deleted_at is null;
    if v_volume > v_remaining then
      return jsonb_build_object('status','permanently_rejected','code','bottle_empty','message','There is not enough left for that pour. Refresh and choose a smaller amount.');
    end if;
    if p_plan_item_id is null then
      v_custom := jsonb_build_object('label',v_bottle.label,'category',v_bottle.category,'volume_ml',v_volume,'abv_percent',v_bottle.abv_percent);
    end if;
  end if;
  v_result := private.log_drink_without_bottle(p_target_member_id,p_plan_item_id,v_custom,p_consumed_at,p_idempotency_key,p_ack_plan_exceeded,p_ack_after_end);
  if v_bottle_id is not null and v_result ->> 'status' = 'created' then
    update public.drink_logs set shared_bottle_id = v_bottle_id where id = (v_result -> 'log' ->> 'id')::uuid returning * into v_log;
    v_result := jsonb_set(v_result, '{log}', private.drink_log_json(v_log));
  end if;
  return v_result;
end;
$$;
revoke all on function public.create_shared_bottle(uuid, jsonb) from public, anon;
revoke all on function public.set_shared_bottle_membership(uuid, uuid, boolean) from public, anon;
revoke all on function public.close_shared_bottle(uuid) from public, anon;
grant execute on function public.create_shared_bottle(uuid, jsonb) to authenticated;
grant execute on function public.set_shared_bottle_membership(uuid, uuid, boolean) to authenticated;
grant execute on function public.close_shared_bottle(uuid) to authenticated;
