begin;

-- Deliberately separate from drink_logs: unknown dose must not become zero or a default measure.
create table public.quick_night_logs (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  night_member_id uuid not null references public.night_members(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete cascade,
  source_session_id uuid not null,
  source_entry_id uuid not null unique,
  source_revision integer not null check (source_revision > 0),
  source_kind text not null check (source_kind in ('drink', 'shot')),
  source_sequence bigint not null check (source_sequence > 0),
  kind text not null check (kind in ('drink', 'shot')),
  recorded_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (source_session_id, source_sequence)
);
create index quick_night_logs_member_idx on public.quick_night_logs(night_member_id);
create index quick_night_logs_night_idx on public.quick_night_logs(night_id);
create index quick_night_logs_actor_idx on public.quick_night_logs(actor_user_id);
alter table public.quick_night_logs enable row level security;
revoke all on public.quick_night_logs from public, anon, authenticated;
grant select on public.quick_night_logs to authenticated;
create policy quick_night_logs_read on public.quick_night_logs for select to authenticated
using (deleted_at is null and private.is_current_night_member(night_id, (select auth.uid())));

create table private.quick_log_import_operations (
  id uuid primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index quick_log_import_operations_actor_idx on private.quick_log_import_operations(actor_user_id);
alter table private.quick_log_import_operations enable row level security;
revoke all on private.quick_log_import_operations from public, anon, authenticated;

-- The private definer follows DWD's existing validated RPC architecture. No direct client writes.
create function private.import_quick_log(p_operation_id uuid, p_session_id uuid, p_night_id uuid, p_member_id uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_payload jsonb := jsonb_build_object('sessionId', p_session_id, 'nightId', p_night_id, 'memberId', p_member_id, 'entries', p_entries);
  v_previous private.quick_log_import_operations%rowtype;
  v_night public.nights%rowtype;
  v_entry jsonb;
  v_id uuid;
  v_source uuid;
  v_recorded timestamptz;
  v_receipt jsonb;
  v_refs jsonb := '[]'::jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_operation_id is null or p_session_id is null or p_night_id is null or p_member_id is null
    or p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Invalid quick log request.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 500 or octet_length(p_entries::text) > 200000 then
    raise exception 'Add between 1 and 500 entries at a time.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 17));
  select * into v_previous from private.quick_log_import_operations where id = p_operation_id;
  if found then
    if v_previous.actor_user_id <> v_actor then raise exception 'Operation unavailable.' using errcode = '42501'; end if;
    if v_previous.payload <> v_payload then raise exception 'This request changed. Use the original entries.' using errcode = '22023'; end if;
    -- A committed import remains recoverable even if the night ended or membership changed afterwards.
    return v_previous.receipt;
  end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.status <> 'active' then raise exception 'This night is unavailable or has ended.' using errcode = '42501'; end if;
  perform 1 from public.night_members where id = p_member_id and night_id = p_night_id
    and user_id = v_actor and left_at is null for update;
  if not found then raise exception 'Add logs to your own participant record.' using errcode = '42501'; end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_entries) e) <> jsonb_array_length(p_entries)
    or (select count(distinct e->>'sequence') from jsonb_array_elements(p_entries) e) <> jsonb_array_length(p_entries) then
    raise exception 'Duplicate source entries.' using errcode = '22023';
  end if;
  -- Stable lock ordering also protects concurrent batches with different operation IDs.
  for v_entry in select value from jsonb_array_elements(p_entries) order by value->>'id' loop
    if jsonb_typeof(v_entry) <> 'object' or not (v_entry ?& array['id','sessionId','kind','recordedAt','sequence','revision'])
      or (select count(*) from jsonb_object_keys(v_entry)) <> 6
      or jsonb_typeof(v_entry->'id') is distinct from 'string'
      or jsonb_typeof(v_entry->'sessionId') is distinct from 'string'
      or jsonb_typeof(v_entry->'kind') is distinct from 'string'
      or jsonb_typeof(v_entry->'recordedAt') is distinct from 'string'
      or v_entry->>'kind' not in ('drink','shot') or (v_entry->>'sessionId')::uuid is distinct from p_session_id
      or jsonb_typeof(v_entry->'revision') <> 'number' or (v_entry->>'revision') !~ '^[1-9][0-9]{0,8}$'
      or jsonb_typeof(v_entry->'sequence') <> 'number' or (v_entry->>'sequence') !~ '^[1-9][0-9]{0,14}$'
      or (v_entry->>'recordedAt') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'Invalid count-only entry.' using errcode = '22023';
    end if;
    v_source := (v_entry->>'id')::uuid;
    v_recorded := (v_entry->>'recordedAt')::timestamptz;
    if v_source is null or v_recorded is null or not isfinite(v_recorded)
      or v_recorded < '1970-01-01 UTC'::timestamptz or v_recorded > clock_timestamp() + interval '24 hours' then
      raise exception 'Invalid recording time.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_source::text, 23));
    if exists(select 1 from public.quick_night_logs where source_entry_id = v_source) then
      raise exception 'These source entries were already added to a night.' using errcode = '23505';
    end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    insert into public.quick_night_logs(night_id, night_member_id, actor_user_id, source_session_id,
      source_entry_id, source_revision, source_kind, source_sequence, kind, recorded_at)
    values(p_night_id, p_member_id, v_actor, p_session_id, (v_entry->>'id')::uuid,
      (v_entry->>'revision')::integer, v_entry->>'kind', (v_entry->>'sequence')::bigint,
      v_entry->>'kind', (v_entry->>'recordedAt')::timestamptz) returning id into v_id;
    v_refs := v_refs || jsonb_build_array(jsonb_build_object('sourceEntryId', v_entry->>'id', 'destinationEntryId', v_id, 'revision', (v_entry->>'revision')::integer));
  end loop;
  v_receipt := jsonb_build_object('operationId', p_operation_id, 'accountId', v_actor, 'nightId', p_night_id, 'memberId', p_member_id, 'entries', v_refs);
  insert into private.quick_log_import_operations(id, actor_user_id, payload, receipt) values(p_operation_id, v_actor, v_payload, v_receipt);
  -- Only invalidate history. No dose alerts, drink triggers, schedule changes or historical notifications.
  update public.nights set updated_at = clock_timestamp() where id = p_night_id;
  return v_receipt;
end $$;
revoke all on function private.import_quick_log(uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.import_quick_log(uuid,uuid,uuid,uuid,jsonb) to authenticated;
create function public.import_quick_log(p_operation_id uuid, p_session_id uuid, p_night_id uuid, p_member_id uuid, p_entries jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.import_quick_log(p_operation_id,p_session_id,p_night_id,p_member_id,p_entries);
$$;
revoke all on function public.import_quick_log(uuid,uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.import_quick_log(uuid,uuid,uuid,uuid,jsonb) to authenticated;

create function private.correct_quick_log(p_entry_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry public.quick_night_logs%rowtype; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('drink','shot','remove') then raise exception 'Invalid entry kind.' using errcode = '22023'; end if;
  select * into v_entry from public.quick_night_logs where id = p_entry_id for update;
  if not found or v_entry.actor_user_id is distinct from v_actor or not exists(
    select 1 from public.night_members m where m.id = v_entry.night_member_id and m.user_id = v_actor and m.left_at is null
  ) then raise exception 'Entry unavailable.' using errcode = '42501'; end if;
  if clock_timestamp() > v_entry.created_at + interval '15 minutes' then
    raise exception 'The 15-minute correction window has closed.' using errcode = '55000';
  end if;
  update public.quick_night_logs set kind = case when p_kind = 'remove' then kind else p_kind end,
    deleted_at = case when p_kind = 'remove' then coalesce(deleted_at, clock_timestamp()) else deleted_at end,
    updated_at = clock_timestamp() where id = p_entry_id;
  update public.nights set updated_at = clock_timestamp() where id = v_entry.night_id;
  insert into public.audit_events(night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values(v_entry.night_id, v_actor, 'activity.quick_corrected', 'quick_log', p_entry_id, to_jsonb(v_entry), jsonb_build_object('kind',p_kind));
  return jsonb_build_object('corrected',true);
end $$;
revoke all on function private.correct_quick_log(uuid,text) from public, anon, authenticated;
grant execute on function private.correct_quick_log(uuid,text) to authenticated;
create function public.correct_quick_log(p_entry_id uuid, p_kind text)
returns jsonb language sql security invoker set search_path = '' as $$ select private.correct_quick_log(p_entry_id,p_kind); $$;
revoke all on function public.correct_quick_log(uuid,text) from public, anon;
grant execute on function public.correct_quick_log(uuid,text) to authenticated;

create function private.quick_logs_json(p_member_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'nightId',q.night_id,'nightMemberId',q.night_member_id,'actorUserId',q.actor_user_id,
    'sourceSessionId',q.source_session_id,'sourceEntryId',q.source_entry_id,'sourceRevision',q.source_revision,
    'sequence',q.source_sequence,'kind',q.kind,'recordedAt',q.recorded_at,'createdAt',q.created_at,
    'updatedAt',q.updated_at,'deletedAt',q.deleted_at,'earlierLogging',q.recorded_at < n.starts_at,
    'volumeMl',null,'abvPercent',null,'ethanolGrams',null
  ) order by q.source_session_id,q.source_sequence),'[]'::jsonb)
  from public.quick_night_logs q join public.nights n on n.id = q.night_id
  where q.night_member_id = p_member_id and q.deleted_at is null;
$$;
revoke all on function private.quick_logs_json(uuid) from public, anon, authenticated;

-- Extend authoritative snapshots without reimplementing detailed nights or their permissions.
alter function private.build_night_snapshot(uuid,uuid) rename to build_measured_night_snapshot;
create function private.with_quick_logs(p_snapshot jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_set(p_snapshot,'{members}',coalesce((select jsonb_agg(m || jsonb_build_object('quickLogs',private.quick_logs_json((m->>'id')::uuid))) from jsonb_array_elements(p_snapshot->'members') m),'[]'::jsonb));
$$;
revoke all on function private.with_quick_logs(jsonb) from public, anon, authenticated;
create function private.build_night_snapshot(p_night_id uuid,p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.with_quick_logs(private.build_measured_night_snapshot(p_night_id,p_user_id));
$$;
revoke all on function private.build_night_snapshot(uuid,uuid) from public, anon, authenticated;
alter function public.get_finished_night_summary(uuid) set schema private;
alter function private.get_finished_night_summary(uuid) rename to get_measured_finished_night_summary;
revoke all on function private.get_measured_finished_night_summary(uuid) from public, anon, authenticated;
create function public.get_finished_night_summary(p_night_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.with_quick_logs(private.get_measured_finished_night_summary(p_night_id));
$$;
revoke all on function public.get_finished_night_summary(uuid) from public, anon;
grant execute on function public.get_finished_night_summary(uuid) to authenticated;
alter function public.get_finished_nights(integer) set schema private;
alter function private.get_finished_nights(integer) rename to get_measured_finished_nights;
revoke all on function private.get_measured_finished_nights(integer) from public, anon, authenticated;
create function public.get_finished_nights(p_page integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(n || jsonb_build_object(
    'quickDrinkCount',(select count(*) from public.quick_night_logs q where q.night_member_id = (n->>'memberId')::uuid and q.kind = 'drink' and q.deleted_at is null),
    'quickShotCount',(select count(*) from public.quick_night_logs q where q.night_member_id = (n->>'memberId')::uuid and q.kind = 'shot' and q.deleted_at is null)
  )),'[]'::jsonb) from jsonb_array_elements(private.get_measured_finished_nights(p_page)) n;
$$;
revoke all on function public.get_finished_nights(integer) from public, anon;
grant execute on function public.get_finished_nights(integer) to authenticated;

-- Existing members can open a still-valid invitation even after its new-member quota is full.
-- Keep redemption in the existing RPC; this only makes its idempotent membership path reachable.
alter function public.get_invite_preview(text) set schema private;
alter function private.get_invite_preview(text) rename to get_base_invite_preview;
revoke all on function private.get_base_invite_preview(text) from public, anon, authenticated;
create function private.get_quick_invite_preview(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_preview jsonb; v_night public.nights%rowtype; v_host_name text;
begin
  v_preview := private.get_base_invite_preview(p_token_hash);
  if v_preview->>'reason' = 'full' and auth.uid() is not null then
    select n.* into v_night from public.nights n join public.night_invites i on i.night_id=n.id
    where i.token_hash=p_token_hash and private.is_current_night_member(n.id,auth.uid());
    if found then
      select display_name into v_host_name from public.profiles where id=v_night.host_user_id;
      return jsonb_build_object('valid',true,'nightTitle',v_night.title,'hostDisplayName',v_host_name,
        'startsAt',v_night.starts_at,'endsAt',v_night.ends_at,'timezone',v_night.timezone);
    end if;
  end if;
  return v_preview;
end $$;
revoke all on function private.get_quick_invite_preview(text) from public;
grant execute on function private.get_quick_invite_preview(text) to anon,authenticated;
create function public.get_invite_preview(p_token_hash text)
-- Bind the private helper at definition time; anon need not gain USAGE on the private schema.
returns jsonb language sql stable security invoker set search_path = ''
return private.get_quick_invite_preview(p_token_hash);
revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon,authenticated;

commit;
