begin;

-- Raise the saved-photo limit without removing existing memories or changing quotas.
alter table public.night_photos drop constraint night_photos_max_memory_bytes;
alter table public.night_photos add constraint night_photos_max_memory_bytes
  check (deleted_at is not null or byte_size <= 5242880) not valid;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 5242880 where id = 'night-memories';
  end if;
end;
$$;
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
    and (new.metadata->>'size')::bigint > 5242880 then
    raise exception 'Photos must be 5 MB or smaller.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_memory_object_limits() from public, anon, authenticated, service_role;

create or replace function public.register_night_photo(
  p_photo_id uuid, p_night_id uuid, p_object_path text, p_mime_type text,
  p_byte_size integer, p_width integer default null, p_height integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_metadata jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('account-memory/' || auth.uid()::text, 0));
  if not private.memory_account_available() then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_byte_size is null or p_byte_size not between 1 and 5242880 then
    raise exception 'Photos must be 5 MB or smaller.' using errcode = '22023';
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


commit;
