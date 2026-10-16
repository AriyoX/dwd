begin;

-- Update limits and pending capacity atomically, keeping old completed records intact.
set local lock_timeout = '5s';
lock table public.photo_events, public.photo_upload_reservations, public.event_photos in access exclusive mode;

alter table public.photo_upload_reservations
  drop constraint photo_upload_reservations_expected_bytes_check,
  add constraint photo_upload_reservations_expected_bytes_check check (expected_bytes between 1 and 4194304),
  drop constraint photo_upload_reservations_reserved_bytes_check,
  alter column reserved_bytes set default 4325376;

alter table public.event_photos
  drop constraint event_photos_size_bytes_check,
  add constraint event_photos_size_bytes_check check (size_bytes between 1 and 4194304);

-- Existing pending uploads may be re-encoded by the new server to a larger JPEG.
-- Top up their holds too. The event budget constraint aborts this transaction if
-- there is insufficient room, rather than silently overcommitting storage.
with upgraded as (
  update public.photo_upload_reservations set reserved_bytes = 4325376
  where status in ('pending', 'verifying') and reserved_bytes = 2228224
  returning event_id
), totals as (
  select event_id, count(*)::bigint * 2097152 as extra_bytes
  from upgraded group by event_id
)
update public.photo_events e
set reserved_bytes = e.reserved_bytes + totals.extra_bytes, updated_at = now()
from totals where e.id = totals.event_id;

alter table public.photo_upload_reservations
  add constraint photo_upload_reservations_reserved_bytes_check check (
    reserved_bytes = 4325376 or
    (reserved_bytes = 2228224 and status in ('completed', 'rejected', 'expired'))
  );

create or replace function public.link_up_reserve(p_session uuid,p_batch uuid,p_files jsonb)
returns setof public.photo_upload_reservations language plpgsql security invoker set search_path='' as $$
declare e public.photo_events%rowtype; f jsonb; v_count integer; v_id uuid; v_existing integer; v_pending integer; v_published integer;
begin
  perform public.link_up_expire_uploads();
  select * into e from public.photo_events where slug='the-link-up' for update;
  if not e.uploads_enabled then raise exception 'uploads_paused'; end if;
  if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'invalid_batch'; end if;
  v_count:=jsonb_array_length(p_files);
  if v_count < 1 or v_count > e.batch_limit then raise exception 'invalid_batch'; end if;
  if (select count(distinct x->>'clientId') from jsonb_array_elements(p_files) x) <> v_count then raise exception 'invalid_batch'; end if;
  insert into public.photo_guest_sessions(id,event_id) values(p_session,e.id) on conflict(id) do nothing;
  select count(*) into v_existing from public.photo_upload_reservations where session_id=p_session and batch_id=p_batch;
  if v_existing > 0 then
    if v_existing <> v_count or exists (
      select 1 from jsonb_array_elements(p_files) x where not exists (
        select 1 from public.photo_upload_reservations r where r.session_id=p_session and r.batch_id=p_batch
          and r.client_id=(x->>'clientId')::uuid and r.fingerprint=x->>'fingerprint'
          and r.expected_bytes=(x->>'size')::integer and r.content_type=x->>'type'
      )
    ) then raise exception 'batch_changed'; end if;
    return query select * from public.photo_upload_reservations where session_id=p_session and batch_id=p_batch order by created_at,id;
    return;
  end if;
  select published_count into v_published from public.photo_guest_sessions where id=p_session;
  select count(*) into v_pending from public.photo_upload_reservations where session_id=p_session and status in ('pending','verifying');
  if v_published+v_pending+v_count > e.session_photo_limit then raise exception 'session_quota'; end if;
  if e.used_bytes+e.reserved_bytes+v_count::bigint*4325376 > e.storage_budget_bytes then raise exception 'storage_quota'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    v_id:=gen_random_uuid();
    insert into public.photo_upload_reservations(id,event_id,session_id,batch_id,client_id,fingerprint,content_type,expected_bytes,temporary_key,final_key,thumbnail_key)
    values(v_id,e.id,p_session,p_batch,(f->>'clientId')::uuid,f->>'fingerprint',f->>'type',(f->>'size')::integer,
      'temporary/the-link-up/'||v_id||'/'||gen_random_uuid(),
      'published/the-link-up/'||v_id||'/photo.jpg','published/the-link-up/'||v_id||'/thumb.jpg');
  end loop;
  update public.photo_events set reserved_bytes=reserved_bytes+v_count::bigint*4325376,updated_at=now() where id=e.id;
  return query select * from public.photo_upload_reservations where session_id=p_session and batch_id=p_batch order by created_at,id;
end $$;


-- CREATE OR REPLACE preserves the existing service-only function grants.
commit;
