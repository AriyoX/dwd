-- Incremental DWD product update: completed-night memories, idempotent mid-night
-- guests, explicit prospective plan validation, and resilient check-in reminders.

alter table public.night_members
  add column if not exists participant_key uuid;

create unique index if not exists night_members_managed_guest_request_unique
  on public.night_members (night_id, managed_by_user_id, participant_key)
  where member_type = 'guest' and participant_key is not null;

create table public.night_photos (
  id uuid primary key,
  night_id uuid not null references public.nights(id) on delete cascade,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  uploader_name text not null check (char_length(btrim(uploader_name)) between 1 and 60),
  object_path text not null unique check (char_length(object_path) between 10 and 500),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  constraint night_photos_deleted_after_create check (deleted_at is null or deleted_at >= created_at)
);

create index night_photos_night_created_idx
  on public.night_photos (night_id, created_at desc, id)
  where deleted_at is null;

alter table public.night_photos enable row level security;

create policy night_photos_select_participants
on public.night_photos for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.night_members m
    where m.night_id = night_photos.night_id
      and m.user_id = (select auth.uid())
  )
);

revoke all on table public.night_photos from anon, authenticated;
grant select on table public.night_photos to authenticated;

-- The bucket is private. Browser uploads are deliberately restricted to ended
-- nights and to the signed-in participant's own namespaced object path. The
-- guard lets the repository's bare-Postgres test image apply this migration;
-- Supabase projects always have these Storage service tables provisioned.
do $storage_setup$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'night-memories', 'night-memories', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp']
      )
      on conflict (id) do update set
        public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types
    $sql$;
    execute $sql$
      create policy night_memories_select_participants
      on storage.objects for select to authenticated
      using (
        bucket_id = 'night-memories'
        and exists (
          select 1
          from public.night_members m
          join public.night_photos p on p.night_id = m.night_id
          where m.user_id = (select auth.uid())
            and m.night_id::text = (storage.foldername(name))[1]
            and p.object_path = name
            and p.deleted_at is null
        )
      )
    $sql$;
    execute $sql$
      create policy night_memories_insert_after_end
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'night-memories'
        and owner_id = (select auth.uid())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (
          select 1
          from public.nights n
          join public.night_members m on m.night_id = n.id
          where n.id::text = (storage.foldername(name))[1]
            and n.status = 'ended'
            and m.user_id = (select auth.uid())
        )
      )
    $sql$;
    execute $sql$
      create policy night_memories_delete_own
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'night-memories'
        and owner_id = (select auth.uid())::text
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
    $sql$;
  end if;
end;
$storage_setup$;

create or replace function public.register_night_photo(
  p_photo_id uuid,
  p_night_id uuid,
  p_object_path text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer default null,
  p_height integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
  v_photo public.night_photos%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_object_path <> p_night_id::text || '/' || v_actor::text || '/' || p_photo_id::text ||
      (case p_mime_type when 'image/png' then '.png' when 'image/webp' then '.webp' else '.jpg' end) then
    raise exception 'Photo path is invalid.' using errcode = '22023';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size not between 1 and 10485760
    or (p_width is not null and p_width not between 1 and 10000)
    or (p_height is not null and p_height not between 1 and 10000) then
    raise exception 'Photo details are invalid.' using errcode = '22023';
  end if;
  select m.display_name into v_name
  from public.nights n
  join public.night_members m on m.night_id = n.id
  where n.id = p_night_id and n.status = 'ended' and m.user_id = v_actor;
  if v_name is null then raise exception 'Night not found.' using errcode = '42501'; end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'night-memories' and o.name = p_object_path and o.owner_id = v_actor::text
  ) then
    raise exception 'Upload the photo before saving it.' using errcode = '22023';
  end if;
  insert into public.night_photos (
    id, night_id, uploaded_by_user_id, uploader_name, object_path,
    mime_type, byte_size, width, height
  ) values (
    p_photo_id, p_night_id, v_actor, v_name, p_object_path,
    p_mime_type, p_byte_size, p_width, p_height
  )
  on conflict (id) do nothing;
  select * into v_photo from public.night_photos
  where id = p_photo_id and uploaded_by_user_id = v_actor and deleted_at is null;
  if not found then raise exception 'Photo could not be saved.' using errcode = '42501'; end if;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_night_id, v_actor, 'photo.added', 'night_photo', p_photo_id,
    jsonb_build_object('mime_type', p_mime_type, 'byte_size', p_byte_size)
  ) on conflict do nothing;
  return jsonb_build_object(
    'id', v_photo.id,
    'nightId', v_photo.night_id,
    'uploadedByUserId', v_photo.uploaded_by_user_id,
    'uploaderName', v_photo.uploader_name,
    'objectPath', v_photo.object_path,
    'mimeType', v_photo.mime_type,
    'byteSize', v_photo.byte_size,
    'width', v_photo.width,
    'height', v_photo.height,
    'createdAt', v_photo.created_at
  );
end;
$$;

create or replace function public.get_night_photos(p_night_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.night_members m
    join public.nights n on n.id = m.night_id
    where m.night_id = p_night_id and m.user_id = v_actor and n.status = 'ended'
  ) then raise exception 'Night not found.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'nightId', p.night_id,
      'uploadedByUserId', p.uploaded_by_user_id,
      'uploaderName', p.uploader_name,
      'objectPath', p.object_path,
      'mimeType', p.mime_type,
      'byteSize', p.byte_size,
      'width', p.width,
      'height', p.height,
      'createdAt', p.created_at
    ) order by p.created_at desc, p.id)
    from public.night_photos p where p.night_id = p_night_id and p.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.delete_night_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_photo public.night_photos%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_photo from public.night_photos where id = p_photo_id for update;
  if not found or v_photo.uploaded_by_user_id is distinct from v_actor then
    raise exception 'Photo not found.' using errcode = '42501';
  end if;
  if v_photo.deleted_at is null then
    update public.night_photos set deleted_at = clock_timestamp() where id = p_photo_id;
    insert into public.audit_events (night_id, actor_user_id, action, entity_type, entity_id)
    values (v_photo.night_id, v_actor, 'photo.deleted', 'night_photo', p_photo_id);
  end if;
  return jsonb_build_object('deleted', true, 'objectPath', v_photo.object_path);
end;
$$;

create or replace function public.add_managed_guest_v2(
  p_night_id uuid,
  p_display_name text,
  p_plan jsonb,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night public.nights%rowtype;
  v_member_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'Request key is required.' using errcode = '22023'; end if;
  select id into v_member_id from public.night_members
  where night_id = p_night_id and managed_by_user_id = v_actor and participant_key = p_request_key;
  if found then return private.build_night_snapshot(p_night_id, v_actor); end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Guest display name is invalid.' using errcode = '22023';
  end if;
  perform private.validate_plan(p_plan);
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or v_night.status <> 'active'
    or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  if (select count(*) from public.night_members where night_id = p_night_id and member_type = 'guest' and left_at is null) >= 20 then
    raise exception 'This night already has the maximum managed guests.' using errcode = '22023';
  end if;
  insert into public.night_members (
    night_id, display_name, member_type, role, managed_by_user_id, participant_key, joined_at
  ) values (
    p_night_id, btrim(p_display_name), 'guest', 'member', v_actor, p_request_key, v_now
  )
  on conflict (night_id, managed_by_user_id, participant_key)
    where member_type = 'guest' and participant_key is not null
  do nothing
  returning id into v_member_id;
  if v_member_id is not null then
    perform private.insert_plan(v_member_id, v_actor, p_plan, v_now);
    insert into public.audit_events (
      night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
    ) values (
      p_night_id, v_actor, 'guest.created', 'night_member', v_member_id,
      jsonb_build_object('display_name', btrim(p_display_name), 'joined_at', v_now), v_now
    );
  end if;
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

-- Plans remain versioned. The new validation compares prospective planned
-- ethanol with immutable recorded activity; one recorded drink is valid when
-- an adjusted plan still covers it.
create or replace function public.replace_member_plan_v2(
  p_member_id uuid,
  p_items jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_member public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_logged_total numeric := 0;
  v_item jsonb;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.validate_plan(p_items);
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found then raise exception 'Member not found.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = v_member.night_id for update;
  if v_night.status <> 'active' then raise exception 'Ended nights are read-only.' using errcode = '55000'; end if;
  if not private.is_current_night_member(v_night.id, v_actor) then
    raise exception 'Member not found.' using errcode = '42501';
  end if;
  if not (
    (v_member.member_type = 'account' and v_member.user_id = v_actor and v_member.left_at is null)
    or private.can_manage_member(v_member.id, v_actor)
  ) then raise exception 'You cannot adjust this plan.' using errcode = '42501'; end if;
  if p_expected_revision is not null and p_expected_revision <> v_member.plan_revision then
    raise exception 'This plan changed in another tab. Reload and review it.' using errcode = '40001';
  end if;
  select coalesce(sum(round(p.volume_ml * (p.abv_percent / 100.0) * 0.789, 3) * p.planned_quantity), 0)
  into v_old_total from public.drink_plan_items p
  where p.night_member_id = v_member.id and p.archived_at is null;
  select coalesce(sum(d.ethanol_grams), 0) into v_logged_total
  from public.drink_logs d where d.night_member_id = v_member.id and d.deleted_at is null;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_new_total := v_new_total + round(
      (v_item ->> 'volumeMl')::numeric * ((v_item ->> 'abvPercent')::numeric / 100.0) * 0.789, 3
    ) * (v_item ->> 'plannedQuantity')::integer;
  end loop;
  if v_new_total + 0.01 < v_logged_total then
    raise exception 'Adjusted plan cannot be below activity already logged.' using errcode = '22023';
  end if;
  update public.drink_plan_items
  set archived_at = v_now, is_quick_log = false, updated_at = v_now
  where night_member_id = v_member.id and archived_at is null;
  perform private.insert_plan(v_member.id, v_actor, p_items, v_now);
  update public.night_members
  set plan_setup_completed_at = coalesce(plan_setup_completed_at, v_now),
      plan_revision = plan_revision + 1
  where id = v_member.id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
  ) values (
    v_night.id, v_actor, 'plan.adjusted', 'night_member', v_member.id,
    jsonb_build_object('planned_ethanol_grams', round(v_old_total, 3), 'logged_ethanol_grams', round(v_logged_total, 3)),
    jsonb_build_object('planned_ethanol_grams', round(v_new_total, 3)), v_now
  );
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

alter table public.notification_preferences
  add column if not exists reminders_muted_until timestamptz;

alter table public.notification_preferences drop constraint if exists notification_preferences_interval_check;
update public.notification_preferences set periodic_interval_minutes = 60
where periodic_interval_minutes not in (15, 30, 45, 60);
alter table public.notification_preferences
  add constraint notification_preferences_interval_check
  check (periodic_interval_minutes in (15, 30, 45, 60));

alter table public.notification_schedules drop constraint if exists notification_schedules_interval_check;
update public.notification_schedules set interval_minutes = 60
where kind = 'periodic_water' and interval_minutes not in (15, 30, 45, 60);
alter table public.notification_schedules
  add constraint notification_schedules_interval_check
  check (
    kind = 'planned_end' and interval_minutes is null
    or kind = 'periodic_water' and interval_minutes in (15, 30, 45, 60)
  );

create or replace function public.get_notification_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_preferences public.notification_preferences%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_preferences from public.notification_preferences where user_id = v_actor;
  return jsonb_build_object(
    'groupAttentionEnabled', coalesce(v_preferences.group_attention_enabled, true),
    'directCheckinsEnabled', coalesce(v_preferences.direct_checkins_enabled, true),
    'personalPaceEnabled', coalesce(v_preferences.personal_pace_enabled, false),
    'plannedEndEnabled', coalesce(v_preferences.planned_end_enabled, false),
    'periodicWaterEnabled', coalesce(v_preferences.periodic_water_enabled, false),
    'periodicIntervalMinutes', coalesce(v_preferences.periodic_interval_minutes, 60),
    'remindersMutedUntil', v_preferences.reminders_muted_until
  );
end;
$$;

create or replace function public.update_notification_preferences(
  p_group_attention_enabled boolean,
  p_direct_checkins_enabled boolean,
  p_personal_pace_enabled boolean,
  p_planned_end_enabled boolean,
  p_periodic_water_enabled boolean,
  p_periodic_interval_minutes integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_periodic_interval_minutes not in (15, 30, 45, 60) then
    raise exception 'Reminder interval is invalid.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (
    user_id, group_attention_enabled, direct_checkins_enabled, personal_pace_enabled,
    planned_end_enabled, periodic_water_enabled, periodic_interval_minutes
  ) values (
    v_actor, p_group_attention_enabled, p_direct_checkins_enabled, p_personal_pace_enabled,
    p_planned_end_enabled, p_periodic_water_enabled, p_periodic_interval_minutes
  ) on conflict (user_id) do update set
    group_attention_enabled = excluded.group_attention_enabled,
    direct_checkins_enabled = excluded.direct_checkins_enabled,
    personal_pace_enabled = excluded.personal_pace_enabled,
    planned_end_enabled = excluded.planned_end_enabled,
    periodic_water_enabled = excluded.periodic_water_enabled,
    periodic_interval_minutes = excluded.periodic_interval_minutes,
    reminders_muted_until = case when excluded.periodic_water_enabled then public.notification_preferences.reminders_muted_until else null end,
    updated_at = clock_timestamp();
  perform private.sync_notification_schedules(v_actor);
  return public.get_notification_preferences();
end;
$$;

create or replace function public.set_reminder_pause(p_minutes integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_until timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_minutes is not null and p_minutes not in (30, 60, 120, 240) then
    raise exception 'Pause duration is invalid.' using errcode = '22023';
  end if;
  v_until := case when p_minutes is null then null else clock_timestamp() + make_interval(mins => p_minutes) end;
  insert into public.notification_preferences (user_id, reminders_muted_until)
  values (v_actor, v_until)
  on conflict (user_id) do update set reminders_muted_until = excluded.reminders_muted_until,
    updated_at = clock_timestamp();
  update public.notification_schedules
  set next_due_at = greatest(next_due_at, coalesce(v_until, next_due_at)), updated_at = clock_timestamp()
  where user_id = v_actor and kind = 'periodic_water';
  return public.get_notification_preferences();
end;
$$;

-- Keep the existing schedule table and dedupe keys; postpone periodic events
-- during a mute and reset the due time after recent recorded interaction.
create or replace function private.process_due_notification_events(p_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_schedule record;
  v_enabled boolean;
  v_muted_until timestamptz;
  v_last_activity timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  for v_schedule in
    select s.*, n.status, n.ends_at, n.title
    from public.notification_schedules s join public.nights n on n.id = s.night_id
    where s.next_due_at <= v_now and (p_user_id is null or s.user_id = p_user_id)
    order by s.next_due_at, s.id for update of s skip locked
  loop
    if v_schedule.status <> 'active' or not exists (
      select 1 from public.night_members m where m.night_id = v_schedule.night_id
        and m.user_id = v_schedule.user_id and m.left_at is null
    ) then delete from public.notification_schedules where id = v_schedule.id; continue; end if;
    if v_schedule.kind = 'planned_end' then
      if v_schedule.ends_at > v_now then
        update public.notification_schedules set next_due_at = v_schedule.ends_at where id = v_schedule.id; continue;
      end if;
      if v_schedule.ends_at <= v_now - interval '2 hours' then
        delete from public.notification_schedules where id = v_schedule.id; continue;
      end if;
      select coalesce(p.planned_end_enabled, false) into v_enabled
      from public.notification_preferences p where p.user_id = v_schedule.user_id;
      if not coalesce(v_enabled, false) then delete from public.notification_schedules where id = v_schedule.id; continue; end if;
      perform private.insert_notification_event(
        'planned-end:' || v_schedule.night_id::text || ':' || extract(epoch from v_schedule.ends_at)::text,
        v_schedule.user_id, null, v_schedule.night_id, null, 'personal_reminder', 'planned_end',
        'Night check-in', 'Your planned night has ended.', '/night/' || v_schedule.night_id::text,
        v_now + interval '2 hours'
      );
      delete from public.notification_schedules where id = v_schedule.id;
    else
      select coalesce(p.periodic_water_enabled, false), p.reminders_muted_until
      into v_enabled, v_muted_until from public.notification_preferences p where p.user_id = v_schedule.user_id;
      if not coalesce(v_enabled, false) then delete from public.notification_schedules where id = v_schedule.id; continue; end if;
      if v_muted_until is not null and v_muted_until > v_now then
        update public.notification_schedules set next_due_at = v_muted_until, updated_at = v_now where id = v_schedule.id; continue;
      end if;
      select max(activity_at) into v_last_activity from (
        select max(d.created_at) activity_at from public.drink_logs d
        join public.night_members m on m.id = d.night_member_id
        where d.night_id = v_schedule.night_id and d.deleted_at is null
          and (m.user_id = v_schedule.user_id or m.managed_by_user_id = v_schedule.user_id)
        union all
        select max(w.created_at) from public.water_logs w
        join public.night_members m on m.id = w.night_member_id
        where w.night_id = v_schedule.night_id and w.deleted_at is null
          and (m.user_id = v_schedule.user_id or m.managed_by_user_id = v_schedule.user_id)
      ) activity;
      if v_last_activity is not null and v_last_activity + make_interval(mins => v_schedule.interval_minutes) > v_now then
        update public.notification_schedules
        set next_due_at = v_last_activity + make_interval(mins => v_schedule.interval_minutes), updated_at = v_now
        where id = v_schedule.id; continue;
      end if;
      perform private.insert_notification_event(
        'check-in:' || v_schedule.id::text || ':' || floor(extract(epoch from v_now) / (v_schedule.interval_minutes * 60))::bigint,
        v_schedule.user_id, null, v_schedule.night_id, null, 'personal_reminder', 'periodic_water',
        'Quick check-in — anything to log?', 'Keep your night record up to date.',
        '/night/' || v_schedule.night_id::text || '?fast=drink', v_now + make_interval(mins => v_schedule.interval_minutes)
      );
      update public.notification_schedules
      set next_due_at = v_now + make_interval(mins => v_schedule.interval_minutes), updated_at = v_now
      where id = v_schedule.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.register_night_photo(uuid, uuid, text, text, integer, integer, integer) from public, anon;
revoke all on function public.get_night_photos(uuid) from public, anon;
revoke all on function public.delete_night_photo(uuid) from public, anon;
revoke all on function public.add_managed_guest_v2(uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.set_reminder_pause(integer) from public, anon;
revoke all on function private.process_due_notification_events(uuid) from public, anon, authenticated;

grant execute on function public.register_night_photo(uuid, uuid, text, text, integer, integer, integer) to authenticated;
grant execute on function public.get_night_photos(uuid) to authenticated;
grant execute on function public.delete_night_photo(uuid) to authenticated;
grant execute on function public.add_managed_guest_v2(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.set_reminder_pause(integer) to authenticated;

-- New public tables are not assumed to be Data API-exposed by project defaults.
grant usage on schema public to authenticated;

alter publication supabase_realtime add table public.night_photos;
