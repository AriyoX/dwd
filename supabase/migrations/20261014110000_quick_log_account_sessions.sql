begin;

-- Counts and recording times only. Detailed drink tables and calculations stay separate.
create table public.quick_log_sessions (
  id uuid primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  finished_at timestamptz,
  unique(id, account_id)
);
create index quick_log_sessions_owner_created_idx on public.quick_log_sessions(account_id, created_at desc, id);
create table public.quick_log_entries (
  id uuid primary key,
  session_id uuid not null,
  account_id uuid not null,
  kind text not null check (kind in ('drink','shot','chaser')),
  recorded_at timestamptz not null,
  source_sequence bigint not null check (source_sequence > 0),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null,
  removed_at timestamptz,
  foreign key(session_id, account_id) references public.quick_log_sessions(id, account_id) on delete cascade,
  unique(session_id, source_sequence)
);
create index quick_log_entries_owner_idx on public.quick_log_entries(account_id);
alter table public.quick_log_sessions enable row level security;
alter table public.quick_log_entries enable row level security;
revoke all on public.quick_log_sessions, public.quick_log_entries from public, anon, authenticated;
grant select on public.quick_log_sessions, public.quick_log_entries to authenticated;
create policy quick_sessions_owner_read on public.quick_log_sessions for select to authenticated using ((select auth.uid()) = account_id);
create policy quick_entries_owner_read on public.quick_log_entries for select to authenticated using ((select auth.uid()) = account_id);

create function private.account_quick_session(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',s.id,'schemaVersion',3,'scope','account:' || s.account_id::text,
    'claimedBy',s.account_id,'createdAt',s.created_at,'updatedAt',s.updated_at,'finishedAt',s.finished_at,
    'state',case when s.finished_at is null then 'active' else 'finished' end,
    'entries',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'sessionId',e.session_id,'kind',e.kind,'recordedAt',e.recorded_at,
      'sequence',e.source_sequence,'revision',e.revision,'updatedAt',e.updated_at,'removedAt',e.removed_at,
      'destination',case when q.id is null then null else jsonb_build_object('nightId',q.night_id,
        'memberId',q.night_member_id,'entryId',q.id,'operationId',o.id) end
    ) order by e.source_sequence) from public.quick_log_entries e
      left join public.quick_night_logs q on q.source_entry_id=e.id
      left join private.quick_log_import_operations o on o.actor_user_id=s.account_id
        and o.receipt->'entries' @> jsonb_build_array(jsonb_build_object('sourceEntryId',e.id))
      where e.session_id=s.id),'[]'::jsonb))
  from public.quick_log_sessions s where s.id=p_id;
$$;
revoke all on function private.account_quick_session(uuid) from public,anon,authenticated;

create function private.sync_quick_log(p_session jsonb,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_id uuid; v_created timestamptz; v_updated timestamptz; v_finished timestamptz;
  v_session public.quick_log_sessions%rowtype; v_previous public.quick_log_entries%rowtype;
  v_entry jsonb; v_entry_id uuid; v_recorded timestamptz; v_entry_updated timestamptz; v_removed timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_session is null or jsonb_typeof(p_session) <> 'object'
    or not (p_session ?& array['id','createdAt','updatedAt','finishedAt'])
    or (select count(*) from jsonb_object_keys(p_session)) <> 4
    or jsonb_typeof(p_session->'id') is distinct from 'string'
    or jsonb_typeof(p_session->'createdAt') is distinct from 'string'
    or jsonb_typeof(p_session->'updatedAt') is distinct from 'string'
    or jsonb_typeof(p_session->'finishedAt') not in ('null','string')
    or p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Invalid Quick Log session.' using errcode='22023';
  end if;
  if jsonb_array_length(p_entries) > 500 or octet_length(p_entries::text) > 400000 then
    raise exception 'Save up to 500 entries at a time.' using errcode='22023';
  end if;
  v_id := (p_session->>'id')::uuid; v_created := (p_session->>'createdAt')::timestamptz;
  v_updated := (p_session->>'updatedAt')::timestamptz; v_finished := (p_session->>'finishedAt')::timestamptz;
  if v_id is null or v_created is null or v_updated is null or not isfinite(v_created) or not isfinite(v_updated)
    or (v_finished is not null and not isfinite(v_finished)) then
    raise exception 'Invalid session times.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,37));
  select * into v_session from public.quick_log_sessions where id=v_id for update;
  if found and v_session.account_id <> v_actor then
    raise exception 'This Quick Log session belongs to another account.' using errcode='42501';
  end if;
  if found and v_session.created_at <> v_created then
    raise exception 'Session identity changed.' using errcode='22023';
  end if;
  if exists(select 1 from public.quick_night_logs where source_session_id=v_id and actor_user_id is distinct from v_actor)
    or exists(select 1 from private.quick_log_import_operations where payload->>'sessionId'=v_id::text and actor_user_id<>v_actor) then
    raise exception 'This Quick Log session belongs to another account.' using errcode='42501';
  end if;
  insert into public.quick_log_sessions(id,account_id,created_at,updated_at,finished_at)
    values(v_id,v_actor,v_created,v_updated,v_finished)
  on conflict(id) do update set updated_at=excluded.updated_at,finished_at=excluded.finished_at
    where excluded.updated_at > quick_log_sessions.updated_at;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_entries) e) <> jsonb_array_length(p_entries) then
    raise exception 'Duplicate source entries.' using errcode='22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) order by value->>'id' loop
    if jsonb_typeof(v_entry) <> 'object'
      or not (v_entry ?& array['id','sessionId','kind','recordedAt','sequence','revision','updatedAt','removedAt','destination'])
      or (select count(*) from jsonb_object_keys(v_entry)) <> 9
      or jsonb_typeof(v_entry->'id') is distinct from 'string'
      or jsonb_typeof(v_entry->'sessionId') is distinct from 'string'
      or jsonb_typeof(v_entry->'kind') is distinct from 'string'
      or (v_entry->>'sessionId')::uuid is distinct from v_id
      or v_entry->>'kind' not in ('drink','shot','chaser')
      or jsonb_typeof(v_entry->'recordedAt') is distinct from 'string'
      or jsonb_typeof(v_entry->'updatedAt') is distinct from 'string'
      or jsonb_typeof(v_entry->'removedAt') not in ('null','string')
      or jsonb_typeof(v_entry->'revision') is distinct from 'number' or (v_entry->>'revision') !~ '^[1-9][0-9]{0,8}$'
      or jsonb_typeof(v_entry->'sequence') is distinct from 'number' or (v_entry->>'sequence') !~ '^[1-9][0-9]{0,14}$' then
      raise exception 'Invalid count-only entry.' using errcode='22023';
    end if;
    v_entry_id := (v_entry->>'id')::uuid; v_recorded := (v_entry->>'recordedAt')::timestamptz;
    v_entry_updated := (v_entry->>'updatedAt')::timestamptz; v_removed := (v_entry->>'removedAt')::timestamptz;
    if v_entry_id is null or v_recorded is null or v_entry_updated is null
      or not isfinite(v_recorded) or not isfinite(v_entry_updated) or (v_removed is not null and not isfinite(v_removed)) then
      raise exception 'Invalid recording time.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_entry_id::text,23));
    if exists(select 1 from public.quick_night_logs where source_entry_id=v_entry_id
      and (actor_user_id is distinct from v_actor or source_session_id<>v_id)) then
      raise exception 'This entry belongs to another session or account.' using errcode='42501';
    end if;
    select * into v_previous from public.quick_log_entries where id=v_entry_id for update;
    if found then
      if v_previous.account_id<>v_actor or v_previous.session_id<>v_id then
        raise exception 'This entry belongs to another session or account.' using errcode='42501';
      end if;
      if v_previous.recorded_at<>v_recorded or v_previous.source_sequence<>(v_entry->>'sequence')::bigint then
        raise exception 'Entry identity changed.' using errcode='22023';
      end if;
      if (v_entry->>'revision')::integer > v_previous.revision
        and exists(select 1 from public.quick_night_logs where source_entry_id=v_entry_id) then
        raise exception 'This entry is now in a night. Make changes there.' using errcode='55000';
      end if;
      if v_previous.revision=(v_entry->>'revision')::integer
        and (v_previous.kind<>v_entry->>'kind' or v_previous.removed_at is distinct from v_removed) then
        raise exception 'This entry changed on another device. Your device copy is kept.' using errcode='40001';
      end if;
    end if;
    insert into public.quick_log_entries(id,session_id,account_id,kind,recorded_at,source_sequence,revision,updated_at,removed_at)
      values(v_entry_id,v_id,v_actor,v_entry->>'kind',v_recorded,(v_entry->>'sequence')::bigint,
        (v_entry->>'revision')::integer,v_entry_updated,v_removed)
    on conflict(id) do update set kind=excluded.kind,revision=excluded.revision,updated_at=excluded.updated_at,removed_at=excluded.removed_at
      where excluded.revision>quick_log_entries.revision;
  end loop;
  return private.account_quick_session(v_id);
end;
$$;
revoke all on function private.sync_quick_log(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.sync_quick_log(jsonb,jsonb) to authenticated;
create function public.sync_quick_log(p_session jsonb,p_entries jsonb) returns jsonb
language sql security invoker set search_path = ''
return private.sync_quick_log(p_session,p_entries);
revoke all on function public.sync_quick_log(jsonb,jsonb) from public,anon;
grant execute on function public.sync_quick_log(jsonb,jsonb) to authenticated;

create function private.get_quick_log_sessions(p_page integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page.' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(private.account_quick_session(s.id) order by s.created_at desc,s.id)
    from (select id,created_at from public.quick_log_sessions where account_id=auth.uid()
      order by created_at desc,id limit 50 offset p_page*50) s),'[]'::jsonb);
end;
$$;
revoke all on function private.get_quick_log_sessions(integer) from public,anon,authenticated;
grant execute on function private.get_quick_log_sessions(integer) to authenticated;
create function public.get_quick_log_sessions(p_page integer default 0) returns jsonb
language sql stable security invoker set search_path = '' return private.get_quick_log_sessions(p_page);
revoke all on function public.get_quick_log_sessions(integer) from public,anon;
grant execute on function public.get_quick_log_sessions(integer) to authenticated;

-- Preserve the tested import transaction and receipt recovery; add ownership of standalone sessions.
alter function private.import_quick_log(uuid,uuid,uuid,uuid,jsonb) rename to import_device_quick_log;
revoke all on function private.import_device_quick_log(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
create function private.import_quick_log(p_operation_id uuid,p_session_id uuid,p_night_id uuid,p_member_id uuid,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text,37));
  if exists(select 1 from public.quick_log_sessions where id=p_session_id and account_id<>auth.uid())
    or exists(select 1 from public.quick_log_entries e join jsonb_array_elements(p_entries) v on e.id=(v->>'id')::uuid
      where e.account_id<>auth.uid() or e.session_id<>p_session_id) then
    raise exception 'This Quick Log session belongs to another account.' using errcode='42501';
  end if;
  -- A committed receipt still reconciles after later edits. A new import must use
  -- the current account revision and must never resurrect a remote Undo.
  if not exists(select 1 from private.quick_log_import_operations where id=p_operation_id and actor_user_id=auth.uid())
    and exists(select 1 from public.quick_log_entries e join jsonb_array_elements(p_entries) v on e.id=(v->>'id')::uuid
      where e.account_id=auth.uid() and (e.removed_at is not null or e.revision<>(v->>'revision')::integer
        or e.kind<>v->>'kind' or e.recorded_at<>(v->>'recordedAt')::timestamptz or e.source_sequence<>(v->>'sequence')::bigint)) then
    raise exception 'This Quick Log entry changed on another device. Review your entries.' using errcode='40001';
  end if;
  return private.import_device_quick_log(p_operation_id,p_session_id,p_night_id,p_member_id,p_entries);
end;
$$;
revoke all on function private.import_quick_log(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.import_quick_log(uuid,uuid,uuid,uuid,jsonb) to authenticated;
-- Rebind the SQL wrapper after renaming the original implementation.
create or replace function public.import_quick_log(p_operation_id uuid,p_session_id uuid,p_night_id uuid,p_member_id uuid,p_entries jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.import_quick_log(p_operation_id,p_session_id,p_night_id,p_member_id,p_entries);
$$;
commit;
