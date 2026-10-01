begin;

-- No existing support request is converted into an automatic deletion.
create table public.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_id uuid not null default gen_random_uuid(),
  requested_at timestamptz not null default clock_timestamp(),
  delete_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing')),
  claimed_at timestamptz,
  claim_id uuid,
  constraint account_deletions_grace_period check (delete_after = requested_at + interval '30 days')
);
create index account_deletions_due_idx on public.account_deletions (delete_after);
alter table public.account_deletions enable row level security;
create policy account_deletions_select_own on public.account_deletions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.account_deletions from public, anon, authenticated;
grant select on public.account_deletions to authenticated;

create or replace function public.schedule_account_deletion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_requested timestamptz := clock_timestamp();
  v_deletion public.account_deletions%rowtype;
begin
  -- Use the same lock order as Auth login and the deletion worker.
  perform 1 from auth.users where id = v_actor for update;
  if not found then raise exception 'Authentication required.' using errcode = '42501'; end if;
  insert into public.account_deletions (user_id, requested_at, delete_after)
  values (v_actor, v_requested, v_requested + interval '30 days')
  on conflict (user_id) do nothing;
  select * into strict v_deletion from public.account_deletions where user_id = v_actor;
  return jsonb_build_object('deleteAfter', v_deletion.delete_after, 'status', v_deletion.status);
end;
$$;

create or replace function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  perform 1 from auth.users where id = v_actor for update;
  if not found then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if exists (select 1 from public.account_deletions where user_id = v_actor and status = 'processing') then
    raise exception 'Account deletion is already in progress.' using errcode = '55000';
  end if;
  delete from public.account_deletions where user_id = v_actor;
end;
$$;

-- Covers password, Google and email-link logins, including other devices.
-- Refreshing an existing session does not change last_sign_in_at.
create or replace function private.cancel_deletion_on_login()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    if exists (select 1 from public.account_deletions where user_id = new.id and status = 'processing') then
      raise exception 'Account deletion is already in progress.' using errcode = '55000';
    end if;
    delete from public.account_deletions
    where user_id = new.id and new.last_sign_in_at > requested_at;
  end if;
  return new;
end;
$$;
create trigger auth_users_cancel_deletion_on_login
  before update of last_sign_in_at on auth.users
  for each row execute function private.cancel_deletion_on_login();
revoke all on function private.cancel_deletion_on_login() from public, anon, authenticated;

-- Archive hosted nights without removing the other participants' history.
-- Direct, unprepared host deletion remains blocked by the existing FK/trigger.
alter table public.nights alter column host_user_id drop not null;
alter table public.night_members drop constraint night_members_kind_consistency;
alter table public.night_members add constraint night_members_kind_consistency check (
  (member_type = 'account' and managed_by_user_id is null and (
    user_id is not null or (role = 'member' and left_at is not null
      and display_name = 'Deleted user' and display_name_at_end = 'Deleted user')
  )) or (member_type = 'guest' and user_id is null and role = 'member' and (
    managed_by_user_id is not null or (left_at is not null
      and display_name = 'Deleted guest' and display_name_at_end = 'Deleted guest')
  ))
);
create or replace function private.validate_night_member()
returns trigger language plpgsql set search_path = '' as $$
declare v_host uuid;
begin
  select n.host_user_id into v_host from public.nights n where n.id = new.night_id;
  if not found then raise exception 'Night does not exist.' using errcode = '23503'; end if;
  if new.member_type = 'guest' and new.managed_by_user_id is distinct from v_host then
    raise exception 'Managed guests must be managed by the night host.' using errcode = '23514';
  end if;
  if new.role = 'host' and (new.member_type <> 'account' or new.user_id is distinct from v_host) then
    raise exception 'Host membership must belong to the night host.' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter table public.night_end_time_changes alter column changed_by drop not null;
alter table public.night_end_time_changes drop constraint night_end_time_changes_changed_by_fkey;
alter table public.night_end_time_changes add constraint night_end_time_changes_changed_by_fkey
  foreign key (changed_by) references auth.users(id) on delete set null;
create or replace function private.protect_extension_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.changed_by is not null and new.changed_by is null
    and (to_jsonb(new) - 'changed_by') = (to_jsonb(old) - 'changed_by') then
    return new;
  end if;
  raise exception 'End-time history is immutable.' using errcode = '55000';
end;
$$;
alter table public.night_invites drop constraint night_invites_created_by_fkey;
alter table public.night_invites add constraint night_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

create or replace function public.claim_account_deletions(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_candidate uuid;
  v_user auth.users%rowtype;
  v_deletion public.account_deletions%rowtype;
  v_jobs jsonb := '[]'::jsonb;
  v_paths jsonb;
begin
  for v_candidate in
    select user_id from public.account_deletions
    where delete_after <= clock_timestamp()
      and (claimed_at is null or claimed_at < clock_timestamp() - interval '15 minutes')
    order by delete_after limit greatest(1, least(coalesce(p_limit, 10), 10))
  loop
    select * into v_user from auth.users where id = v_candidate for update skip locked;
    if not found then continue; end if;
    select * into v_deletion from public.account_deletions
      where user_id = v_candidate for update skip locked;
    if not found or v_deletion.delete_after > clock_timestamp()
      or v_deletion.claimed_at >= clock_timestamp() - interval '15 minutes' then continue; end if;
    if v_user.last_sign_in_at > v_deletion.requested_at then
      delete from public.account_deletions where user_id = v_candidate;
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('account-memory/' || v_candidate::text, 0));
    update public.account_deletions set status = 'processing', claimed_at = clock_timestamp(),
      claim_id = gen_random_uuid() where user_id = v_candidate returning * into v_deletion;
    -- Revoke refresh sessions before destructive work. Upload policies also reject processing users.
    delete from auth.sessions where user_id = v_candidate;
    v_paths := '[]'::jsonb;
    if to_regclass('storage.objects') is not null then
      select coalesce(jsonb_agg(name), '[]'::jsonb) into v_paths from storage.objects
      where bucket_id = 'night-memories'
        and (owner_id = v_candidate::text or split_part(name, '/', 2) = v_candidate::text);
    end if;
    v_jobs := v_jobs || jsonb_build_array(jsonb_build_object(
      'userId', v_candidate, 'requestId', v_deletion.request_id,
      'claimId', v_deletion.claim_id, 'objectPaths', v_paths
    ));
  end loop;
  return v_jobs;
end;
$$;

create or replace function public.complete_account_deletion(p_user_id uuid, p_request_id uuid, p_claim_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_deletion public.account_deletions%rowtype;
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found then return false; end if;
  select * into v_deletion from public.account_deletions where user_id = p_user_id for update;
  if not found or v_deletion.request_id is distinct from p_request_id or v_deletion.claim_id is distinct from p_claim_id
    or v_deletion.status <> 'processing' or v_deletion.delete_after > clock_timestamp() then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-memory/' || p_user_id::text, 0));
  if to_regclass('storage.objects') is not null and exists (
    select 1 from storage.objects where bucket_id = 'night-memories'
      and (owner_id = p_user_id::text or split_part(name, '/', 2) = p_user_id::text)
  ) then raise exception 'Remove account photos through Storage before deleting the account.' using errcode = '55000'; end if;

  update public.nights set status = 'ended', ended_at = coalesce(ended_at, greatest(starts_at, clock_timestamp())),
    host_user_id = null where host_user_id = p_user_id;
  update public.night_members set role = 'member' where user_id = p_user_id and role = 'host';
  update public.audit_events set actor_user_id = null, entity_id = null,
    before_data = null, after_data = '{"account_deleted":true}'::jsonb
  where actor_user_id = p_user_id or entity_id in (
    select id from public.night_members where user_id = p_user_id or managed_by_user_id = p_user_id
  );
  -- Guests managed by a departing host also retain anonymous history.
  update public.night_alerts a set message = replace(replace(a.message,
    m.display_name, 'A participant'), coalesce(m.display_name_at_end, m.display_name), 'A participant')
  from public.night_members m where a.night_member_id = m.id and m.managed_by_user_id = p_user_id;
  update public.notification_events e set
    title = replace(replace(e.title, m.display_name, 'A participant'), coalesce(m.display_name_at_end, m.display_name), 'A participant'),
    body = replace(replace(e.body, m.display_name, 'A participant'), coalesce(m.display_name_at_end, m.display_name), 'A participant')
  from public.night_members m where e.target_member_id = m.id and m.managed_by_user_id = p_user_id;
  update public.night_members set managed_by_user_id = null,
    display_name = 'Deleted guest', display_name_at_end = 'Deleted guest',
    left_at = coalesce(left_at, greatest(joined_at, clock_timestamp()))
  where managed_by_user_id = p_user_id;
  delete from public.notification_schedules where night_id in (
    select id from public.nights where host_user_id is null
  );
  delete from private.invite_revocations where user_id = p_user_id;
  delete from public.night_photos where uploaded_by_user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.schedule_account_deletion(), public.cancel_account_deletion()
  from public, anon;
grant execute on function public.schedule_account_deletion(), public.cancel_account_deletion() to authenticated;
revoke all on function public.claim_account_deletions(integer), public.complete_account_deletion(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_account_deletions(integer), public.complete_account_deletion(uuid, uuid, uuid)
  to service_role;

-- Serialize quota checks across uploads and registrations, including concurrent tabs.
create index night_photos_uploader_night_idx on public.night_photos (uploaded_by_user_id, night_id)
  where deleted_at is null;
-- Keep existing larger photos; enforce the smaller limit on future writes.
alter table public.night_photos add constraint night_photos_max_memory_bytes
  check (deleted_at is not null or byte_size <= 2097152) not valid;
create or replace function private.enforce_night_photo_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.night_id::text || '/' || new.uploaded_by_user_id::text, 0));
  if new.deleted_at is null and (select count(*) from public.night_photos
    where night_id = new.night_id and uploaded_by_user_id = new.uploaded_by_user_id
      and deleted_at is null and id <> new.id) >= 2 then
    raise exception 'You can save up to 2 photos per night.' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger night_photos_enforce_quota before insert or update on public.night_photos
  for each row execute function private.enforce_night_photo_quota();
revoke all on function private.enforce_night_photo_quota() from public, anon, authenticated;

create or replace function private.memory_account_available()
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid())
    and not exists (select 1 from public.account_deletions where user_id = auth.uid() and status = 'processing');
$$;
revoke all on function private.memory_account_available() from public, anon;
grant execute on function private.memory_account_available() to authenticated;

create or replace function private.can_upload_night_memory(p_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_night uuid;
begin
  if v_actor is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-memory/' || v_actor::text, 0));
  if not private.memory_account_available() or split_part(p_path, '/', 2) <> v_actor::text
    or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then return false; end if;
  begin v_night := split_part(p_path, '/', 1)::uuid;
  exception when invalid_text_representation then return false; end;
  if not exists (select 1 from public.nights n join public.night_members m on m.night_id = n.id
    where n.id = v_night and n.status = 'ended' and m.user_id = v_actor) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_night::text || '/' || v_actor::text, 0));
  return (select count(*) from storage.objects where bucket_id = 'night-memories'
    and split_part(name, '/', 1) = v_night::text and split_part(name, '/', 2) = v_actor::text) < 2;
end;
$$;
revoke all on function private.can_upload_night_memory(text) from public, anon;
grant execute on function private.can_upload_night_memory(text) to authenticated;

-- Storage permission probes run separately from the final object insertion.
-- Enforce quotas on that insertion too, when the service writes as its admin role.
create or replace function private.enforce_memory_object_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_night uuid;
begin
  if new.bucket_id <> 'night-memories' then return new; end if;
  begin
    v_actor := split_part(new.name, '/', 2)::uuid;
    v_night := split_part(new.name, '/', 1)::uuid;
  exception when invalid_text_representation then
    raise exception 'Photo path is invalid.' using errcode = '22023';
  end;
  if new.owner_id is distinct from v_actor::text then
    raise exception 'Photo owner does not match its path.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-memory/' || v_actor::text, 0));
  if not exists (select 1 from public.profiles where id = v_actor)
    or exists (select 1 from public.account_deletions where user_id = v_actor and status = 'processing') then
    raise exception 'Account is unavailable.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name
    or new.bucket_id is distinct from old.bucket_id or new.owner_id is distinct from old.owner_id then
    perform pg_advisory_xact_lock(hashtextextended(v_night::text || '/' || v_actor::text, 0));
    if (select count(*) from storage.objects where bucket_id = 'night-memories'
      and split_part(name, '/', 1) = v_night::text and split_part(name, '/', 2) = v_actor::text
      and id <> new.id) >= 2 then
      raise exception 'You can save up to 2 photos per night.' using errcode = '54000';
    end if;
  end if;
  if (tg_op = 'INSERT' or new.metadata->>'size' is distinct from old.metadata->>'size')
    and (new.metadata->>'size')::bigint > 2097152 then
    raise exception 'Photos must be 2 MB or smaller.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_memory_object_limits() from public, anon, authenticated, service_role;

do $storage_limits$
begin
  if to_regclass('storage.objects') is not null then
    execute $sql$create trigger night_memories_enforce_object_limits
      before insert or update of name, bucket_id, owner_id, metadata on storage.objects
      for each row execute function private.enforce_memory_object_limits()$sql$;
    update storage.buckets set file_size_limit = 2097152 where id = 'night-memories';
    execute 'drop policy night_memories_insert_after_end on storage.objects';
    execute $sql$create policy night_memories_insert_after_end on storage.objects
      for insert to authenticated with check (bucket_id = 'night-memories'
        and owner_id = (select auth.uid())::text and private.can_upload_night_memory(name))$sql$;
    -- Allow the uploader to clean up uploads that failed before metadata registration.
    execute $sql$create policy night_memories_select_own_uploads on storage.objects
      for select to authenticated using (bucket_id = 'night-memories'
        and owner_id = (select auth.uid())::text and (storage.foldername(name))[2] = (select auth.uid())::text
        and private.memory_account_available())$sql$;
    execute $sql$create policy night_memories_available_account on storage.objects
      as restrictive for all to authenticated
      using (bucket_id <> 'night-memories' or private.memory_account_available())
      with check (bucket_id <> 'night-memories' or private.memory_account_available())$sql$;
  end if;
end;
$storage_limits$;

-- Retain the existing participant/path checks; verify metadata against the actual upload.
alter function public.register_night_photo(uuid, uuid, text, text, integer, integer, integer) set schema private;
revoke all on function private.register_night_photo(uuid, uuid, text, text, integer, integer, integer)
  from public, anon, authenticated;
create or replace function public.register_night_photo(
  p_photo_id uuid, p_night_id uuid, p_object_path text, p_mime_type text,
  p_byte_size integer, p_width integer default null, p_height integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_metadata jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('account-memory/' || auth.uid()::text, 0));
  if not private.memory_account_available() then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_byte_size is null or p_byte_size not between 1 and 2097152 then
    raise exception 'Photos must be 2 MB or smaller.' using errcode = '22023';
  end if;
  -- Match the original RPC's authorization error before looking up Storage.
  if not exists (select 1 from public.nights n join public.night_members m on m.night_id = n.id
    where n.id = p_night_id and n.status = 'ended' and m.user_id = auth.uid()) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  select metadata into v_metadata from storage.objects
    where bucket_id = 'night-memories' and name = p_object_path and owner_id = auth.uid()::text;
  if not found then raise exception 'Upload the photo before saving it.' using errcode = '22023'; end if;
  if (v_metadata->>'size')::bigint is distinct from p_byte_size::bigint
    or v_metadata->>'mimetype' is distinct from p_mime_type then
    raise exception 'Photo details do not match the uploaded file.' using errcode = '22023';
  end if;
  -- A retry should succeed even when both slots have been used.
  if exists (select 1 from public.night_photos where id = p_photo_id and deleted_at is null
    and uploaded_by_user_id = auth.uid() and night_id = p_night_id and object_path = p_object_path) then
    return (select value from jsonb_array_elements(public.get_night_photos(p_night_id)) value
      where value->>'id' = p_photo_id::text);
  end if;
  return private.register_night_photo(p_photo_id, p_night_id, p_object_path, p_mime_type, p_byte_size, p_width, p_height);
end;
$$;
revoke all on function public.register_night_photo(uuid, uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.register_night_photo(uuid, uuid, text, text, integer, integer, integer) to authenticated;

create or replace function private.dispatch_account_deletions()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'dwd_deletion_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'dwd_deletion_secret';
  if v_url is null or v_secret is null or length(v_secret) < 32 then return null; end if;
  if v_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/delete-accounts$' then
    raise exception 'Invalid account deletion worker URL.' using errcode = '22023';
  end if;
  return net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dwd-deletion-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
end;
$$;
revoke all on function private.dispatch_account_deletions() from public, anon, authenticated, service_role;
commit;
