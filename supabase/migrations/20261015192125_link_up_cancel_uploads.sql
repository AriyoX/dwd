begin;
create function public.link_up_cancel(p_session uuid,p_ids uuid[])
returns integer language plpgsql security invoker set search_path='' as $$
declare v_event uuid; v_bytes bigint; v_count integer;
begin
  if cardinality(p_ids) > 10 then raise exception 'invalid_batch'; end if;
  select id into v_event from public.photo_events where slug='the-link-up' for update;
  with cancelled as (
    update public.photo_upload_reservations set status='rejected',error_code='cancelled'
    where session_id=p_session and id=any(p_ids) and status='pending' returning *
  ), queued as (
    insert into public.photo_object_cleanup(object_key,not_before)
    select key,greatest(now(),coalesce(url_expires_at,now())+interval '1 minute')
      from cancelled cross join lateral unnest(array[temporary_key,final_key,thumbnail_key]) key
    on conflict(object_key) do update set not_before=greatest(photo_object_cleanup.not_before,excluded.not_before)
  ) select coalesce(sum(reserved_bytes),0),count(*) into v_bytes,v_count from cancelled;
  update public.photo_events set reserved_bytes=reserved_bytes-v_bytes,updated_at=now() where id=v_event;
  return v_count;
end $$;
revoke all on function public.link_up_cancel(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.link_up_cancel(uuid,uuid[]) to service_role;
commit;
