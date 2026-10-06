-- Add a newly shared bottle to both the creator and the managed guest being tracked.
-- Defaulted arguments preserve installed clients and start_night_with_bottle's five-argument call.
-- Keep a single RPC signature: PostgREST cannot disambiguate defaulted overloads.
drop function public.share_bottle_and_plan(uuid, jsonb, uuid, integer, uuid);

create function public.share_bottle_and_plan(
  p_night_id uuid, p_bottle jsonb, p_member_id uuid, p_expected_revision integer, p_request_key uuid,
  p_make_main boolean default true,
  p_creator_expected_revision integer default null,
  p_creator_make_main boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_member public.night_members%rowtype;
  v_creator public.night_members%rowtype;
  v_bottle public.shared_bottles%rowtype;
  v_prior private.bottle_plan_requests%rowtype;
  v_bottle_id uuid := (p_bottle ->> 'id')::uuid;
  v_quantity integer := (p_bottle ->> 'defaultQuantity')::integer;
  v_main boolean;
  v_items jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  -- Lock both affected plans before the night, consistently across simultaneous guest creations.
  perform 1 from public.night_members
    where id = p_member_id or (night_id = p_night_id and user_id = v_actor)
    order by id for update;
  select * into v_member from public.night_members where id = p_member_id;
  if not found or v_member.night_id <> p_night_id or v_member.left_at is not null
    or not (coalesce(v_member.user_id = v_actor, false) or private.can_manage_member(p_member_id, v_actor)) then
    raise exception 'Bottle unavailable.' using errcode = '42501';
  end if;
  select * into v_creator from public.night_members
    where night_id = p_night_id and user_id = v_actor and left_at is null;
  if not found then raise exception 'Bottle unavailable.' using errcode = '42501'; end if;
  perform 1 from public.nights where id = p_night_id for update;

  select * into v_prior from private.bottle_plan_requests
    where actor_user_id = v_actor and request_key = p_request_key;
  if found then
    if v_prior.member_id <> p_member_id or v_prior.bottle_id <> v_bottle_id then
      raise exception 'This request belongs to another bottle.' using errcode = '22023';
    end if;
    -- A lost response must never reset subsequent changes to either person's plan.
    return private.build_night_snapshot(p_night_id, v_actor);
  end if;
  if p_expected_revision is null or p_expected_revision <> v_member.plan_revision then
    raise exception 'Your plan changed. Close this window and try again.' using errcode = '40001';
  end if;
  if v_creator.id <> p_member_id and p_creator_expected_revision is not null
    and p_creator_expected_revision <> v_creator.plan_revision then
    raise exception 'Your own plan changed. Close this window and try again.' using errcode = '40001';
  end if;
  if p_request_key is null or p_make_main is null or p_creator_make_main is null then
    raise exception 'Check the bottle details.' using errcode = '22023';
  end if;
  if exists (select 1 from public.shared_bottles where id = v_bottle_id) then
    raise exception 'This bottle is already shared. Join or adjust it instead.' using errcode = '22023';
  end if;

  perform public.create_shared_bottle(p_night_id, p_bottle);
  update public.shared_bottles set default_quantity = v_quantity where id = v_bottle_id;
  select * into v_bottle from public.shared_bottles where id = v_bottle_id;
  perform public.plan_shared_bottle(v_bottle_id, p_member_id, v_quantity,
    (p_bottle ->> 'pourMl')::numeric, p_expected_revision, p_request_key, p_make_main);

  if v_creator.id <> p_member_id then
    -- Creation already joins its creator. Append to their plan with an independent main choice.
    v_main := p_creator_make_main or not exists (
      select 1 from public.drink_plan_items
      where night_member_id = v_creator.id and archived_at is null and is_quick_log
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'label', label, 'category', category, 'volumeMl', volume_ml, 'abvPercent', abv_percent,
      'plannedQuantity', planned_quantity, 'isQuickLog', case when v_main then false else is_quick_log end,
      'sharedBottleId', shared_bottle_id
    ) order by created_at, id), '[]'::jsonb) into v_items
    from public.drink_plan_items where night_member_id = v_creator.id and archived_at is null;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'label', v_bottle.label, 'category', v_bottle.category,
      'volumeMl', (p_bottle ->> 'pourMl')::numeric, 'abvPercent', v_bottle.abv_percent,
      'plannedQuantity', v_quantity, 'isQuickLog', v_main, 'sharedBottleId', v_bottle_id
    ));
    -- The target save, creation and retry record all roll back if this second plan cannot be saved.
    perform public.replace_member_plan_v2(v_creator.id, v_items, v_creator.plan_revision);
  end if;
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

revoke all on function public.share_bottle_and_plan(uuid, jsonb, uuid, integer, uuid, boolean, integer, boolean) from public, anon;
grant execute on function public.share_bottle_and_plan(uuid, jsonb, uuid, integer, uuid, boolean, integer, boolean) to authenticated;
notify pgrst, 'reload schema';
