begin;

-- Event memories are deliberately independent of DWD nights, profiles and Quick Log.
-- No browser role can read these tables or call the privileged RPCs.
create table public.photo_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = 'the-link-up'),
  title text not null default 'The Link Up',
  event_date date not null default '2026-10-17',
  uploads_enabled boolean not null default true,
  gallery_enabled boolean not null default true,
  storage_budget_bytes bigint not null default 5368709120 check (storage_budget_bytes > 0),
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  session_photo_limit integer not null default 25 check (session_photo_limit between 1 and 100),
  batch_limit integer not null default 10 check (batch_limit between 1 and 10),
  upload_error_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (used_bytes + reserved_bytes <= storage_budget_bytes)
);
insert into public.photo_events(slug) values ('the-link-up');

create table public.photo_guest_sessions (
  id uuid primary key,
  event_id uuid not null references public.photo_events(id),
  published_count integer not null default 0 check (published_count >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (event_id,id)
);
create table public.photo_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.photo_events(id),
  session_id uuid not null,
  batch_id uuid not null,
  client_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  expected_bytes integer not null check (expected_bytes between 1 and 2097152),
  -- Budget for a maximum-size sanitized image and a bounded 128 KiB thumbnail.
  reserved_bytes bigint not null default 2228224 check (reserved_bytes = 2228224),
  temporary_key text not null unique,
  final_key text not null unique,
  thumbnail_key text not null unique,
  status text not null default 'pending' check (status in ('pending','verifying','completed','rejected','expired')),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  url_expires_at timestamptz,
  renewal_count integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(session_id,client_id),
  foreign key(event_id,session_id) references public.photo_guest_sessions(event_id,id)
);
create table public.event_photos (
  id uuid primary key references public.photo_upload_reservations(id),
  event_id uuid not null references public.photo_events(id),
  session_id uuid not null,
  final_key text not null unique,
  thumbnail_key text not null unique,
  content_type text not null default 'image/jpeg' check (content_type = 'image/jpeg'),
  size_bytes integer not null check (size_bytes between 1 and 2097152),
  thumbnail_bytes integer not null check (thumbnail_bytes between 1 and 131072),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  status text not null default 'published' check (status in ('published','hidden','deleting','deleted')),
  published_at timestamptz not null default now(),
  hidden_at timestamptz,
  deleted_at timestamptz,
  foreign key(event_id,session_id) references public.photo_guest_sessions(event_id,id)
);
create table public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.event_photos(id),
  session_id uuid not null references public.photo_guest_sessions(id),
  reason text not null check (reason in ('inappropriate','privacy','other')),
  status text not null default 'open' check (status in ('open','reviewed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(photo_id,session_id)
);
create table public.photo_event_organizers (
  event_id uuid not null references public.photo_events(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'organizer' check (role = 'organizer'),
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
create table public.photo_rate_limits (
  session_id uuid not null references public.photo_guest_sessions(id),
  action text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key(session_id,action)
);
-- Durable deletion outbox. Keys are removed only after R2 confirms deletion.
create table public.photo_object_cleanup (
  object_key text primary key,
  not_before timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index photo_sessions_event_idx on public.photo_guest_sessions(event_id);
create index photo_reservations_expiry_idx on public.photo_upload_reservations(event_id,expires_at) where status in ('pending','verifying');
create index photo_reservations_batch_idx on public.photo_upload_reservations(session_id,batch_id);
create index event_photos_gallery_idx on public.event_photos(event_id,published_at desc,id desc) where status='published';
create index event_photos_admin_idx on public.event_photos(event_id,published_at desc,id desc);
create index event_photos_session_idx on public.event_photos(session_id);
create index photo_reports_photo_idx on public.photo_reports(photo_id);
create index photo_reports_session_idx on public.photo_reports(session_id);
create index photo_reports_review_idx on public.photo_reports(status,created_at desc);
create index photo_organizers_user_idx on public.photo_event_organizers(user_id);

alter table public.photo_events enable row level security;
alter table public.photo_guest_sessions enable row level security;
alter table public.photo_upload_reservations enable row level security;
alter table public.event_photos enable row level security;
alter table public.photo_reports enable row level security;
alter table public.photo_event_organizers enable row level security;
alter table public.photo_rate_limits enable row level security;
alter table public.photo_object_cleanup enable row level security;
revoke all on public.photo_events, public.photo_guest_sessions, public.photo_upload_reservations,
  public.event_photos, public.photo_reports, public.photo_event_organizers, public.photo_rate_limits,
  public.photo_object_cleanup from public, anon, authenticated;
grant all on public.photo_events, public.photo_guest_sessions, public.photo_upload_reservations,
  public.event_photos, public.photo_reports, public.photo_event_organizers, public.photo_rate_limits,
  public.photo_object_cleanup to service_role;

create function public.link_up_rate_limit(p_session uuid,p_action text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  insert into public.photo_guest_sessions(id,event_id)
    select p_session,id from public.photo_events where slug='the-link-up' on conflict(id) do nothing;
  insert into public.photo_rate_limits(session_id,action,window_start,attempts) values(p_session,p_action,now(),1)
  on conflict(session_id,action) do update set
    attempts=case when photo_rate_limits.window_start + make_interval(secs=>p_seconds) <= now() then 1 else photo_rate_limits.attempts+1 end,
    window_start=case when photo_rate_limits.window_start + make_interval(secs=>p_seconds) <= now() then now() else photo_rate_limits.window_start end
  returning attempts into v_count;
  return v_count <= p_limit;
end $$;

create function public.link_up_expire_uploads()
returns integer language plpgsql security invoker set search_path='' as $$
declare v_event uuid; v_bytes bigint; v_count integer;
begin
  select id into v_event from public.photo_events where slug='the-link-up' for update;
  with expired as (
    update public.photo_upload_reservations set status='expired',error_code='expired'
    where event_id=v_event and status in ('pending','verifying') and expires_at <= now()
      and (lease_until is null or lease_until < now()) returning *
  ), queued as (
    insert into public.photo_object_cleanup(object_key,not_before)
      select key,greatest(now(),coalesce(url_expires_at,now()) + interval '1 minute')
      from expired cross join lateral unnest(array[temporary_key,final_key,thumbnail_key]) key
      on conflict(object_key) do update set not_before=greatest(photo_object_cleanup.not_before,excluded.not_before)
  ) select coalesce(sum(reserved_bytes),0),count(*) into v_bytes,v_count from expired;
  update public.photo_events set reserved_bytes=reserved_bytes-v_bytes,updated_at=now() where id=v_event;
  return v_count;
end $$;

create function public.link_up_reserve(p_session uuid,p_batch uuid,p_files jsonb)
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
  if e.used_bytes+e.reserved_bytes+v_count::bigint*2228224 > e.storage_budget_bytes then raise exception 'storage_quota'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    v_id:=gen_random_uuid();
    insert into public.photo_upload_reservations(id,event_id,session_id,batch_id,client_id,fingerprint,content_type,expected_bytes,temporary_key,final_key,thumbnail_key)
    values(v_id,e.id,p_session,p_batch,(f->>'clientId')::uuid,f->>'fingerprint',f->>'type',(f->>'size')::integer,
      'temporary/the-link-up/'||v_id||'/'||gen_random_uuid(),
      'published/the-link-up/'||v_id||'/photo.jpg','published/the-link-up/'||v_id||'/thumb.jpg');
  end loop;
  update public.photo_events set reserved_bytes=reserved_bytes+v_count::bigint*2228224,updated_at=now() where id=e.id;
  return query select * from public.photo_upload_reservations where session_id=p_session and batch_id=p_batch order by created_at,id;
end $$;

create function public.link_up_upload_url(p_session uuid,p_id uuid)
returns public.photo_upload_reservations language plpgsql security invoker set search_path='' as $$
declare r public.photo_upload_reservations%rowtype; e public.photo_events%rowtype;
begin
  select * into e from public.photo_events where slug='the-link-up' for update;
  if not e.uploads_enabled then raise exception 'uploads_paused'; end if;
  select * into r from public.photo_upload_reservations where id=p_id and session_id=p_session for update;
  if not found or r.status <> 'pending' or r.expires_at < now()+interval '5 minutes' then raise exception 'reservation_expired'; end if;
  if r.renewal_count >= 12 then raise exception 'renewal_limit'; end if;
  update public.photo_upload_reservations set url_expires_at=now()+interval '5 minutes',renewal_count=renewal_count+1 where id=p_id returning * into r;
  return r;
end $$;

create function public.link_up_claim(p_session uuid,p_id uuid,p_lease uuid)
returns public.photo_upload_reservations language plpgsql security invoker set search_path='' as $$
declare r public.photo_upload_reservations%rowtype;
begin
  -- All functions that touch counters acquire the event lock first.
  perform 1 from public.photo_events where slug='the-link-up' for update;
  select * into r from public.photo_upload_reservations where id=p_id and session_id=p_session for update;
  if not found then raise exception 'upload_not_found'; end if;
  if r.status='completed' then return r; end if;
  if r.status not in ('pending','verifying') or r.expires_at < now() then raise exception 'reservation_expired'; end if;
  if r.status='verifying' and r.lease_until > now() then raise exception 'verification_busy'; end if;
  update public.photo_upload_reservations set status='verifying',lease_token=p_lease,lease_until=now()+interval '3 minutes'
    where id=p_id returning * into r;
  return r;
end $$;

create function public.link_up_finish(p_id uuid,p_lease uuid,p_size integer,p_thumb_size integer,p_width integer,p_height integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.photo_upload_reservations%rowtype;
begin
  perform 1 from public.photo_events where slug='the-link-up' for update;
  select * into r from public.photo_upload_reservations where id=p_id for update;
  if r.status='completed' then return p_id; end if;
  if r.status is distinct from 'verifying' or r.lease_token is distinct from p_lease or r.lease_until < now() then raise exception 'lease_lost'; end if;
  insert into public.event_photos(id,event_id,session_id,final_key,thumbnail_key,size_bytes,thumbnail_bytes,width,height)
    values(r.id,r.event_id,r.session_id,r.final_key,r.thumbnail_key,p_size,p_thumb_size,p_width,p_height);
  update public.photo_upload_reservations set status='completed',completed_at=now(),lease_until=null where id=p_id;
  update public.photo_events set used_bytes=used_bytes+p_size+p_thumb_size,reserved_bytes=reserved_bytes-r.reserved_bytes,updated_at=now() where id=r.event_id;
  update public.photo_guest_sessions set published_count=published_count+1,last_seen_at=now() where id=r.session_id;
  -- Wait until the last signed PUT has expired: guests can replay it until then.
  insert into public.photo_object_cleanup(object_key,not_before) values(r.temporary_key,greatest(now(),coalesce(r.url_expires_at,now())+interval '1 minute'))
    on conflict(object_key) do update set not_before=greatest(photo_object_cleanup.not_before,excluded.not_before);
  return p_id;
end $$;

create function public.link_up_fail(p_id uuid,p_lease uuid,p_code text,p_permanent boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.photo_upload_reservations%rowtype;
begin
  perform 1 from public.photo_events where slug='the-link-up' for update;
  select * into r from public.photo_upload_reservations where id=p_id for update;
  if r.status is distinct from 'verifying' or r.lease_token is distinct from p_lease then return; end if;
  update public.photo_events set upload_error_count=upload_error_count+1,
    reserved_bytes=reserved_bytes-case when p_permanent then r.reserved_bytes else 0 end,updated_at=now() where id=r.event_id;
  update public.photo_upload_reservations set status=case when p_permanent then 'rejected' else 'pending' end,
    lease_until=null,error_code=left(p_code,80) where id=p_id;
  if p_permanent then
    insert into public.photo_object_cleanup(object_key,not_before)
      select key,greatest(now(),coalesce(r.url_expires_at,now())+interval '1 minute') from unnest(array[r.temporary_key,r.final_key,r.thumbnail_key]) key
      on conflict(object_key) do update set not_before=greatest(photo_object_cleanup.not_before,excluded.not_before);
  end if;
end $$;

-- Called only by the server after Auth.getUser(); the DB checks auth.users again.
-- Existing organizer rows alone never confer access after an email change.
-- Narrow private definer: service_role intentionally has no SELECT on auth.users.
-- Do not grant that broad privilege just to look up organizer eligibility.
create function private.link_up_verified_organizer(p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
  if current_setting('role',true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() <> p_user) then
    raise exception 'Server authorization required.' using errcode='42501';
  end if;
  select id into v_event from public.photo_events where slug='the-link-up';
  if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null
    and deleted_at is null and (banned_until is null or banned_until <= now())
    and lower(trim(email)) in ('shebatindy@gmail.com','ahumuzaariyo@gmail.com')) then
    delete from public.photo_event_organizers where event_id=v_event and user_id=p_user;
    return false;
  end if;
  insert into public.photo_event_organizers(event_id,user_id) values(v_event,p_user) on conflict do nothing;
  return true;
end $$;
revoke all on function private.link_up_verified_organizer(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.link_up_verified_organizer(uuid) to service_role;
create function public.link_up_provision_organizer(p_user uuid)
returns boolean language sql security invoker set search_path='' as $$
  select private.link_up_verified_organizer(p_user);
$$;

create function public.link_up_moderate(p_id uuid,p_action text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.event_photos%rowtype;
begin
  perform 1 from public.photo_events where slug='the-link-up' for update;
  select * into r from public.event_photos where id=p_id for update;
  if not found then raise exception 'photo_not_found'; end if;
  if p_action='delete' then
    if r.status='deleted' then return; end if;
    update public.event_photos set status='deleting',hidden_at=coalesce(hidden_at,now()) where id=p_id;
    insert into public.photo_object_cleanup(object_key) values(r.final_key),(r.thumbnail_key) on conflict do nothing;
  elsif p_action='hide' and r.status in ('published','hidden') then
    update public.event_photos set status='hidden',hidden_at=now() where id=p_id;
  elsif p_action='show' and r.status='hidden' then
    update public.event_photos set status='published',hidden_at=null where id=p_id;
  else raise exception 'invalid_photo_action'; end if;
  update public.photo_reports set status='reviewed',reviewed_at=now() where photo_id=p_id;
end $$;

create function public.link_up_finalize_deletions()
returns integer language plpgsql security invoker set search_path='' as $$
declare v_bytes bigint; v_count integer; v_event uuid;
begin
  select id into v_event from public.photo_events where slug='the-link-up' for update;
  with removed as (
    update public.event_photos p set status='deleted',deleted_at=now() where event_id=v_event and status='deleting'
      and not exists(select 1 from public.photo_object_cleanup c where c.object_key in (p.final_key,p.thumbnail_key)) returning *
  ) select coalesce(sum(size_bytes+thumbnail_bytes),0),count(*) into v_bytes,v_count from removed;
  update public.photo_events set used_bytes=used_bytes-v_bytes,updated_at=now() where id=v_event;
  return v_count;
end $$;

-- Functions are SECURITY INVOKER and can be called only with the server secret.
revoke all on function public.link_up_rate_limit(uuid,text,integer,integer),public.link_up_expire_uploads(),
  public.link_up_reserve(uuid,uuid,jsonb),public.link_up_upload_url(uuid,uuid),public.link_up_claim(uuid,uuid,uuid),
  public.link_up_finish(uuid,uuid,integer,integer,integer,integer),public.link_up_fail(uuid,uuid,text,boolean),
  public.link_up_provision_organizer(uuid),public.link_up_moderate(uuid,text),public.link_up_finalize_deletions()
  from public, anon, authenticated;
grant execute on function public.link_up_rate_limit(uuid,text,integer,integer),public.link_up_expire_uploads(),
  public.link_up_reserve(uuid,uuid,jsonb),public.link_up_upload_url(uuid,uuid),public.link_up_claim(uuid,uuid,uuid),
  public.link_up_finish(uuid,uuid,integer,integer,integer,integer),public.link_up_fail(uuid,uuid,text,boolean),
  public.link_up_provision_organizer(uuid),public.link_up_moderate(uuid,text),public.link_up_finalize_deletions()
  to service_role;

commit;
