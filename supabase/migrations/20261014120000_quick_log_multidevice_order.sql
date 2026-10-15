begin;
-- Two devices can append offline at the same source sequence. Preserve both entry IDs and
-- recording positions, with deterministic ties, rather than overwriting or renumbering them.
alter table public.quick_log_entries drop constraint quick_log_entries_session_id_source_sequence_key;
create index quick_log_entries_session_sequence_idx on public.quick_log_entries(session_id,source_sequence,id);
create index quick_import_receipt_entries_idx on private.quick_log_import_operations using gin ((receipt->'entries'));

create or replace function private.import_device_quick_log(p_operation_id uuid, p_session_id uuid, p_night_id uuid, p_member_id uuid, p_entries jsonb)
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
    or ((select count(distinct e->>'sequence') from jsonb_array_elements(p_entries) e) <> jsonb_array_length(p_entries)
      and not exists(select 1 from public.quick_log_sessions where id=p_session_id and account_id=v_actor)) then
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
      or v_entry->>'kind' not in ('drink','shot','chaser') or (v_entry->>'sessionId')::uuid is distinct from p_session_id
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

create or replace function private.account_quick_session(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',s.id,'schemaVersion',3,'scope','account:' || s.account_id::text,
    'claimedBy',s.account_id,'createdAt',s.created_at,'updatedAt',s.updated_at,'finishedAt',s.finished_at,
    'state',case when s.finished_at is null then 'active' else 'finished' end,
    'entries',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'sessionId',e.session_id,'kind',e.kind,'recordedAt',e.recorded_at,
      'sequence',e.source_sequence,'revision',e.revision,'updatedAt',e.updated_at,'removedAt',e.removed_at,
      'destination',case when q.id is null then null else jsonb_build_object('nightId',q.night_id,
        'memberId',q.night_member_id,'entryId',q.id,'operationId',o.id) end
    ) order by e.source_sequence,e.recorded_at,e.id) from public.quick_log_entries e
      left join public.quick_night_logs q on q.source_entry_id=e.id
      left join private.quick_log_import_operations o on o.actor_user_id=s.account_id
        and o.receipt->'entries' @> jsonb_build_array(jsonb_build_object('sourceEntryId',e.id))
      where e.session_id=s.id),'[]'::jsonb))
  from public.quick_log_sessions s where s.id=p_id;
$$;

create or replace function private.quick_logs_json(p_member_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'nightId',q.night_id,'nightMemberId',q.night_member_id,'actorUserId',q.actor_user_id,
    'sourceSessionId',q.source_session_id,'sourceEntryId',q.source_entry_id,'sourceRevision',q.source_revision,
    'sequence',q.source_sequence,'kind',q.kind,'recordedAt',q.recorded_at,'createdAt',q.created_at,
    'updatedAt',q.updated_at,'deletedAt',q.deleted_at,'earlierLogging',q.recorded_at < n.starts_at,
    'volumeMl',null,'abvPercent',null,'ethanolGrams',null
  ) order by q.source_session_id,q.source_sequence,q.recorded_at,q.id),'[]'::jsonb)
  from public.quick_night_logs q join public.nights n on n.id = q.night_id
  where q.night_member_id = p_member_id and q.deleted_at is null;
$$;

commit;
