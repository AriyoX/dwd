-- Keep the existing RPC signature and permissions. Initial bottle creation is
-- atomic with night creation; a recovered night already has its bottle and plan.
-- Return its current snapshot without revalidating a past planned end or
-- resetting later bottle/plan adjustments.
create or replace function public.start_night_with_bottle(
  p_creation_key uuid, p_title text, p_ends_at timestamptz, p_timezone text,
  p_host_plan jsonb, p_guests jsonb, p_bottle jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_created jsonb; v_member uuid; v_night uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  v_created := public.start_night_out_recoverable(p_creation_key, p_title, p_ends_at, p_timezone, p_host_plan, p_guests);
  if (v_created ->> 'duplicate')::boolean then return v_created; end if;
  v_night := (v_created ->> 'nightId')::uuid;
  select id into v_member from public.night_members where night_id = v_night and user_id = auth.uid() and left_at is null;
  if v_member is null then raise exception 'Bottle unavailable.' using errcode = '42501'; end if;
  return jsonb_set(v_created, '{snapshot}', public.share_bottle_and_plan(v_night, p_bottle, v_member, 0, p_creation_key));
end;
$$;

revoke all on function public.start_night_with_bottle(uuid, text, timestamptz, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.start_night_with_bottle(uuid, text, timestamptz, text, jsonb, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
