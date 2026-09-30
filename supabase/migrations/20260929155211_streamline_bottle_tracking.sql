-- Choosing a bottle and a personal quantity is one atomic action.
alter table public.shared_bottles add column default_quantity integer not null default 1
  check (default_quantity between 1 and 50);

create table private.bottle_plan_requests (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  member_id uuid not null references public.night_members(id) on delete cascade,
  bottle_id uuid not null references public.shared_bottles(id) on delete cascade,
  primary key (actor_user_id, request_key)
);
create index bottle_plan_requests_member_idx on private.bottle_plan_requests(member_id);
create index bottle_plan_requests_bottle_idx on private.bottle_plan_requests(bottle_id);
alter table private.bottle_plan_requests enable row level security;
revoke all on private.bottle_plan_requests from public, anon, authenticated;

create or replace function private.shared_bottles_json(p_night_id uuid, p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'nightId', b.night_id, 'creatorMemberId', b.creator_member_id,
    'label', b.label, 'category', b.category, 'volumeMl', b.volume_ml,
    'abvPercent', b.abv_percent, 'pourMl', b.pour_ml, 'defaultQuantity', b.default_quantity,
    'access', b.access, 'allowedMemberIds', to_jsonb(b.allowed_member_ids),
    'joinedMemberIds', to_jsonb(b.joined_member_ids), 'closedAt', b.closed_at,
    'remainingMl', b.volume_ml - coalesce((select sum(d.volume_ml) from public.drink_logs d
      where d.shared_bottle_id = b.id and d.deleted_at is null), 0)
  ) order by b.created_at, b.id), '[]'::jsonb)
  from public.shared_bottles b where b.night_id = p_night_id and private.can_view_bottle(b.id, p_user_id);
$$;

create or replace function public.plan_shared_bottle(
  p_bottle_id uuid, p_member_id uuid, p_quantity integer, p_serving_ml numeric,
  p_expected_revision integer, p_request_key uuid, p_make_main boolean default true
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_member public.night_members%rowtype;
  v_bottle public.shared_bottles%rowtype; v_items jsonb; v_main boolean;
  v_prior private.bottle_plan_requests%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found or v_member.left_at is not null or not private.is_current_night_member(v_member.night_id, v_actor)
    or not (coalesce(v_member.user_id = v_actor, false) or private.can_manage_member(p_member_id, v_actor)) then
    raise exception 'Bottle unavailable.' using errcode = '42501';
  end if;
  -- Lock in the same order as normal plan changes and logging.
  perform 1 from public.nights where id = v_member.night_id for update;
  select * into v_prior from private.bottle_plan_requests where actor_user_id = v_actor and request_key = p_request_key;
  if found then
    if v_prior.member_id <> p_member_id or v_prior.bottle_id <> p_bottle_id then
      raise exception 'This request belongs to another bottle.' using errcode = '22023';
    end if;
    return private.build_night_snapshot(v_member.night_id, v_actor);
  end if;
  if p_expected_revision is null or p_expected_revision <> v_member.plan_revision then
    raise exception 'Your plan changed. Close this window and try again.' using errcode = '40001';
  end if;
  if p_request_key is null or p_quantity is null or p_quantity not between 1 and 50 or p_make_main is null then
    raise exception 'Choose between 1 and 50 drinks.' using errcode = '22023';
  end if;
  -- Checks invitation, active night and managed-guest access. Failure rolls back the entire action.
  perform public.set_shared_bottle_membership(p_bottle_id, p_member_id, true);
  select * into v_bottle from public.shared_bottles where id = p_bottle_id for update;
  if p_serving_ml is null or not (p_serving_ml between 1 and least(2000, v_bottle.volume_ml)) then
    raise exception 'Check the drink size.' using errcode = '22023';
  end if;
  v_main := p_make_main or not exists (select 1 from public.drink_plan_items
    where night_member_id = p_member_id and archived_at is null and is_quick_log and shared_bottle_id is distinct from p_bottle_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', label, 'category', category, 'volumeMl', volume_ml, 'abvPercent', abv_percent,
    'plannedQuantity', planned_quantity, 'isQuickLog', case when v_main then false else is_quick_log end,
    'sharedBottleId', shared_bottle_id
  ) order by created_at, id), '[]'::jsonb) into v_items
  from public.drink_plan_items where night_member_id = p_member_id and archived_at is null
    and shared_bottle_id is distinct from p_bottle_id;
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'label', v_bottle.label, 'category', v_bottle.category, 'volumeMl', p_serving_ml,
    'abvPercent', v_bottle.abv_percent, 'plannedQuantity', p_quantity,
    'isQuickLog', v_main, 'sharedBottleId', v_bottle.id
  ));
  perform public.replace_member_plan_v2(p_member_id, v_items, p_expected_revision);
  insert into private.bottle_plan_requests values (v_actor, p_request_key, p_member_id, p_bottle_id);
  return private.build_night_snapshot(v_member.night_id, v_actor);
end;
$$;

create or replace function public.share_bottle_and_plan(
  p_night_id uuid, p_bottle jsonb, p_member_id uuid, p_expected_revision integer, p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_member public.night_members%rowtype;
  v_bottle_id uuid := (p_bottle ->> 'id')::uuid; v_quantity integer := (p_bottle ->> 'defaultQuantity')::integer;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found or v_member.night_id <> p_night_id or v_member.left_at is not null
    or not (coalesce(v_member.user_id = v_actor, false) or private.can_manage_member(p_member_id, v_actor)) then
    raise exception 'Bottle unavailable.' using errcode = '42501';
  end if;
  -- Lock both managed and actor memberships before the night to avoid inverted locks.
  perform 1 from public.night_members where night_id = p_night_id and user_id = v_actor for update;
  perform 1 from public.nights where id = p_night_id for update;
  if exists(select 1 from private.bottle_plan_requests where actor_user_id = v_actor and request_key = p_request_key
    and member_id = p_member_id and bottle_id = v_bottle_id) then
    return private.build_night_snapshot(p_night_id, v_actor);
  end if;
  perform public.create_shared_bottle(p_night_id, p_bottle);
  update public.shared_bottles set default_quantity = v_quantity where id = v_bottle_id;
  return public.plan_shared_bottle(v_bottle_id, p_member_id, v_quantity,
    (p_bottle ->> 'pourMl')::numeric, p_expected_revision, p_request_key, true);
end;
$$;

create or replace function public.start_night_with_bottle(
  p_creation_key uuid, p_title text, p_ends_at timestamptz, p_timezone text,
  p_host_plan jsonb, p_guests jsonb, p_bottle jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_created jsonb; v_snapshot jsonb; v_member uuid; v_night uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  v_created := public.start_night_out(p_creation_key, p_title, p_ends_at, p_timezone, p_host_plan, p_guests);
  v_night := (v_created ->> 'nightId')::uuid;
  select id into v_member from public.night_members where night_id = v_night and user_id = auth.uid() and left_at is null;
  if v_member is null then raise exception 'Bottle unavailable.' using errcode = '42501'; end if;
  -- Creation key also identifies this initial personal plan; replay never resets later adjustments.
  v_snapshot := public.share_bottle_and_plan(v_night, p_bottle, v_member, 0, p_creation_key);
  return jsonb_set(v_created, '{snapshot}', v_snapshot);
end;
$$;

revoke all on function public.plan_shared_bottle(uuid, uuid, integer, numeric, integer, uuid, boolean) from public, anon;
revoke all on function public.share_bottle_and_plan(uuid, jsonb, uuid, integer, uuid) from public, anon;
revoke all on function public.start_night_with_bottle(uuid, text, timestamptz, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.plan_shared_bottle(uuid, uuid, integer, numeric, integer, uuid, boolean) to authenticated;
grant execute on function public.share_bottle_and_plan(uuid, jsonb, uuid, integer, uuid) to authenticated;
grant execute on function public.start_night_with_bottle(uuid, text, timestamptz, text, jsonb, jsonb, jsonb) to authenticated;

-- Carry an existing bottle through a plan edit even after it is put away.
-- Logging still rejects closed bottles; a removed closed bottle cannot be added afresh.
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
        and m.left_at is null and m.id = any(b.joined_member_ids)
        and (b.closed_at is null or exists (
          select 1 from public.drink_plan_items previous
          where previous.night_member_id = p_member_id and previous.shared_bottle_id = b.id
            and previous.archived_at = p_created_at
        ));
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
