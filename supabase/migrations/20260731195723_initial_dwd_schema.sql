begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 60)
);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id),
  creation_key uuid not null,
  title text not null default 'Tonight',
  status text not null default 'active' check (status in ('active', 'ended')),
  starts_at timestamptz not null,
  initial_ends_at timestamptz not null,
  ends_at timestamptz not null,
  ended_at timestamptz,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nights_host_creation_unique unique (host_user_id, creation_key),
  constraint nights_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint nights_timezone_length check (char_length(btrim(timezone)) between 1 and 80),
  constraint nights_initial_end_after_start check (initial_ends_at > starts_at),
  constraint nights_end_not_before_initial check (ends_at >= initial_ends_at),
  constraint nights_max_duration check (ends_at <= starts_at + interval '24 hours'),
  constraint nights_status_end_consistency check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null and ended_at >= starts_at)
  )
);

create table public.night_end_time_changes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  previous_ends_at timestamptz not null,
  new_ends_at timestamptz not null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint night_end_time_changes_forward_only check (new_ends_at > previous_ends_at)
);

create table public.night_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  member_type text not null check (member_type in ('account', 'guest')),
  role text not null default 'member' check (role in ('host', 'member')),
  managed_by_user_id uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint night_members_night_id_id_unique unique (night_id, id),
  constraint night_members_display_name_length check (char_length(btrim(display_name)) between 1 and 60),
  constraint night_members_left_after_join check (left_at is null or left_at >= joined_at),
  constraint night_members_kind_consistency check (
    (member_type = 'account' and user_id is not null and managed_by_user_id is null)
    or (member_type = 'guest' and user_id is null and managed_by_user_id is not null and role = 'member')
  )
);

create unique index night_members_account_unique
  on public.night_members (night_id, user_id)
  where user_id is not null;
create unique index night_members_one_host
  on public.night_members (night_id)
  where role = 'host';

create table public.drink_plan_items (
  id uuid primary key default gen_random_uuid(),
  night_member_id uuid not null references public.night_members(id) on delete cascade,
  label text not null,
  category text not null check (category in ('beer', 'wine', 'spirit', 'cocktail', 'other')),
  volume_ml numeric(8, 2) not null,
  abv_percent numeric(5, 2) not null,
  planned_quantity integer not null,
  is_quick_log boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint drink_plan_items_member_id_id_unique unique (night_member_id, id),
  constraint drink_plan_items_label_length check (char_length(btrim(label)) between 1 and 60),
  constraint drink_plan_items_volume_range check (volume_ml between 1 and 2000),
  constraint drink_plan_items_abv_range check (abv_percent > 0 and abv_percent <= 95),
  constraint drink_plan_items_quantity_range check (planned_quantity between 1 and 50),
  constraint drink_plan_items_archive_after_create check (archived_at is null or archived_at >= created_at),
  constraint drink_plan_items_archived_not_quick check (archived_at is null or is_quick_log = false)
);

create unique index drink_plan_items_one_active_quick
  on public.drink_plan_items (night_member_id)
  where is_quick_log and archived_at is null;

create table public.drink_logs (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  night_member_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  plan_item_id uuid,
  label_snapshot text not null,
  category_snapshot text not null check (category_snapshot in ('beer', 'wine', 'spirit', 'cocktail', 'other')),
  volume_ml numeric(8, 2) not null,
  abv_percent numeric(5, 2) not null,
  ethanol_grams numeric(10, 3) generated always as (
    round(volume_ml * (abv_percent / 100.0) * 0.789, 3)
  ) stored,
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  after_end boolean not null default false,
  idempotency_key uuid not null,
  deleted_at timestamptz,
  constraint drink_logs_label_length check (char_length(btrim(label_snapshot)) between 1 and 60),
  constraint drink_logs_volume_range check (volume_ml between 1 and 2000),
  constraint drink_logs_abv_range check (abv_percent > 0 and abv_percent <= 95),
  constraint drink_logs_actor_idempotency_unique unique (actor_user_id, idempotency_key),
  constraint drink_logs_member_night_fk foreign key (night_id, night_member_id)
    references public.night_members(night_id, id) on delete cascade,
  constraint drink_logs_plan_member_fk foreign key (night_member_id, plan_item_id)
    references public.drink_plan_items(night_member_id, id),
  constraint drink_logs_deleted_after_create check (deleted_at is null or deleted_at >= created_at)
);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  night_member_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  deleted_at timestamptz,
  constraint water_logs_actor_idempotency_unique unique (actor_user_id, idempotency_key),
  constraint water_logs_member_night_fk foreign key (night_id, night_member_id)
    references public.night_members(night_id, id) on delete cascade,
  constraint water_logs_deleted_after_create check (deleted_at is null or deleted_at >= created_at)
);

create table public.night_invites (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint night_invites_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint night_invites_future_expiry check (expires_at > created_at),
  constraint night_invites_max_uses check (max_uses is null or max_uses between 1 and 100),
  constraint night_invites_use_count check (use_count >= 0 and (max_uses is null or use_count <= max_uses)),
  constraint night_invites_revoked_after_create check (revoked_at is null or revoked_at >= created_at)
);

create table public.night_alerts (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  night_member_id uuid,
  type text not null check (type in ('personal_pace', 'group_check_in', 'plan_reached')),
  severity text not null check (severity in ('info', 'caution', 'urgent')),
  visibility text not null check (visibility in ('private', 'group')),
  message text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint night_alerts_member_night_fk foreign key (night_id, night_member_id)
    references public.night_members(night_id, id) on delete cascade,
  constraint night_alerts_message_length check (char_length(message) between 1 and 240),
  constraint night_alerts_dedupe_length check (char_length(dedupe_key) between 1 and 160),
  constraint night_alerts_expiry_after_create check (expires_at is null or expires_at > created_at)
);

create unique index night_alerts_dedupe_unique on public.night_alerts (dedupe_key);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  night_id uuid references public.nights(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_length check (char_length(action) between 1 and 100),
  constraint audit_events_entity_type_length check (char_length(entity_type) between 1 and 80)
);

-- Foreign-key, authorization-predicate, timeline, and common filtered-query indexes.
create index nights_host_user_id_idx on public.nights (host_user_id);
create index nights_status_updated_idx on public.nights (status, updated_at desc);
create index night_end_time_changes_night_id_idx
  on public.night_end_time_changes (night_id, effective_at desc);
create index night_end_time_changes_changed_by_idx on public.night_end_time_changes (changed_by);
create index night_members_night_id_idx on public.night_members (night_id);
create index night_members_user_id_idx on public.night_members (user_id) where user_id is not null;
create index night_members_managed_by_idx
  on public.night_members (managed_by_user_id) where managed_by_user_id is not null;
create index drink_plan_items_member_active_idx
  on public.drink_plan_items (night_member_id, created_at desc) where archived_at is null;
create index drink_plan_items_created_by_idx on public.drink_plan_items (created_by);
create index drink_logs_night_id_idx on public.drink_logs (night_id);
create index drink_logs_member_consumed_idx
  on public.drink_logs (night_member_id, consumed_at desc) where deleted_at is null;
create index drink_logs_actor_user_id_idx on public.drink_logs (actor_user_id);
create index water_logs_night_id_idx on public.water_logs (night_id);
create index water_logs_member_consumed_idx
  on public.water_logs (night_member_id, consumed_at desc) where deleted_at is null;
create index water_logs_actor_user_id_idx on public.water_logs (actor_user_id);
create index night_invites_night_id_idx on public.night_invites (night_id);
create index night_alerts_night_id_idx on public.night_alerts (night_id, created_at desc);
create index night_alerts_member_id_idx
  on public.night_alerts (night_member_id, created_at desc) where night_member_id is not null;
create index audit_events_night_id_idx on public.audit_events (night_id, created_at desc);
create index audit_events_actor_user_id_idx on public.audit_events (actor_user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.nights enable row level security;
alter table public.night_end_time_changes enable row level security;
alter table public.night_members enable row level security;
alter table public.drink_plan_items enable row level security;
alter table public.drink_logs enable row level security;
alter table public.water_logs enable row level security;
alter table public.night_invites enable row level security;
alter table public.night_alerts enable row level security;
alter table public.audit_events enable row level security;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger nights_set_updated_at
before update on public.nights
for each row execute function private.set_updated_at();

create trigger drink_plan_items_set_updated_at
before update on public.drink_plan_items
for each row execute function private.set_updated_at();

create or replace function private.validate_night_member()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_host uuid;
begin
  select n.host_user_id into v_host from public.nights n where n.id = new.night_id;
  if v_host is null then
    raise exception 'Night does not exist.' using errcode = '23503';
  end if;
  if new.member_type = 'guest' and new.managed_by_user_id is distinct from v_host then
    raise exception 'Managed guests must be managed by the night host.' using errcode = '23514';
  end if;
  if new.role = 'host' and (new.member_type <> 'account' or new.user_id is distinct from v_host) then
    raise exception 'Host membership must belong to the night host.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger night_members_validate
before insert or update on public.night_members
for each row execute function private.validate_night_member();

create or replace function private.protect_extension_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'End-time history is immutable.' using errcode = '55000';
end;
$$;

create trigger night_end_time_changes_immutable
before update or delete on public.night_end_time_changes
for each row execute function private.protect_extension_history();

create or replace function private.protect_plan_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.night_member_id is distinct from old.night_member_id
    or new.label is distinct from old.label
    or new.category is distinct from old.category
    or new.volume_ml is distinct from old.volume_ml
    or new.abv_percent is distinct from old.abv_percent
    or new.planned_quantity is distinct from old.planned_quantity
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Plan content is versioned and cannot be mutated.' using errcode = '55000';
  end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'An archived plan version cannot be restored.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger drink_plan_items_protect_version
before update on public.drink_plan_items
for each row execute function private.protect_plan_version();

create or replace function private.protect_drink_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.night_id is distinct from old.night_id
    or new.night_member_id is distinct from old.night_member_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.plan_item_id is distinct from old.plan_item_id
    or new.label_snapshot is distinct from old.label_snapshot
    or new.category_snapshot is distinct from old.category_snapshot
    or new.volume_ml is distinct from old.volume_ml
    or new.abv_percent is distinct from old.abv_percent
    or new.consumed_at is distinct from old.consumed_at
    or new.created_at is distinct from old.created_at
    or new.after_end is distinct from old.after_end
    or new.idempotency_key is distinct from old.idempotency_key
    or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Drink logs are immutable except for first soft deletion.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger drink_logs_protect
before update on public.drink_logs
for each row execute function private.protect_drink_log();

create or replace function private.protect_water_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.night_id is distinct from old.night_id
    or new.night_member_id is distinct from old.night_member_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.consumed_at is distinct from old.consumed_at
    or new.created_at is distinct from old.created_at
    or new.idempotency_key is distinct from old.idempotency_key
    or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Water logs are immutable except for first soft deletion.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger water_logs_protect
before update on public.water_logs
for each row execute function private.protect_water_log();

create or replace function private.is_current_night_member(p_night_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid()) and exists (
    select 1
    from public.night_members m
    where m.night_id = p_night_id
      and m.user_id = p_user_id
      and m.member_type = 'account'
      and m.left_at is null
  );
$$;

create or replace function private.can_manage_member(p_member_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid()) and exists (
    select 1
    from public.night_members target
    join public.nights n on n.id = target.night_id
    join public.night_members actor
      on actor.night_id = target.night_id
     and actor.user_id = p_user_id
     and actor.left_at is null
    where target.id = p_member_id
      and target.member_type = 'guest'
      and target.left_at is null
      and target.managed_by_user_id = p_user_id
      and n.host_user_id = p_user_id
  );
$$;

create or replace function private.can_read_profile(p_profile_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid()) and (
    p_profile_id = p_user_id or exists (
    select 1
    from public.night_members mine
    join public.night_members theirs on theirs.night_id = mine.night_id
    where mine.user_id = p_user_id
      and mine.left_at is null
      and theirs.user_id = p_profile_id
      and theirs.left_at is null
    )
  );
$$;

create or replace function private.applicable_end_at(
  p_night_id uuid,
  p_initial_ends_at timestamptz,
  p_consumed_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select c.new_ends_at
      from public.night_end_time_changes c
      where c.night_id = p_night_id
        and c.effective_at <= p_consumed_at
      order by c.effective_at desc, c.id desc
      limit 1
    ),
    p_initial_ends_at
  );
$$;

create or replace function private.validate_plan(p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer;
  v_quick_count integer := 0;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' then
    raise exception 'Plan items must be an array.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_plan);
  if v_count < 1 or v_count > 20 then
    raise exception 'A plan must contain between 1 and 20 items.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_plan)
  loop
    if char_length(btrim(coalesce(v_item ->> 'label', ''))) not between 1 and 60 then
      raise exception 'Plan item label is invalid.' using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'category', '') not in ('beer', 'wine', 'spirit', 'cocktail', 'other') then
      raise exception 'Plan item category is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'volumeMl')::numeric not between 1 and 2000 then
      raise exception 'Plan item volume is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'abvPercent')::numeric <= 0
      or (v_item ->> 'abvPercent')::numeric > 95 then
      raise exception 'Plan item ABV is invalid.' using errcode = '22023';
    end if;
    if (v_item ->> 'plannedQuantity')::integer not between 1 and 50 then
      raise exception 'Plan item quantity is invalid.' using errcode = '22023';
    end if;
    if coalesce((v_item ->> 'isQuickLog')::boolean, false) then
      v_quick_count := v_quick_count + 1;
    end if;
  end loop;

  if v_quick_count <> 1 then
    raise exception 'Choose exactly one quick-log item.' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.insert_plan(
  p_member_id uuid,
  p_actor_user_id uuid,
  p_plan jsonb,
  p_created_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  perform private.validate_plan(p_plan);
  for v_item in select value from jsonb_array_elements(p_plan)
  loop
    insert into public.drink_plan_items (
      night_member_id,
      label,
      category,
      volume_ml,
      abv_percent,
      planned_quantity,
      is_quick_log,
      created_by,
      created_at,
      updated_at
    ) values (
      p_member_id,
      btrim(v_item ->> 'label'),
      v_item ->> 'category',
      (v_item ->> 'volumeMl')::numeric,
      (v_item ->> 'abvPercent')::numeric,
      (v_item ->> 'plannedQuantity')::integer,
      (v_item ->> 'isQuickLog')::boolean,
      p_actor_user_id,
      p_created_at,
      p_created_at
    );
  end loop;
end;
$$;

create or replace function private.drink_log_json(p_log public.drink_logs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_log.id,
    'nightId', p_log.night_id,
    'nightMemberId', p_log.night_member_id,
    'actorUserId', p_log.actor_user_id,
    'planItemId', p_log.plan_item_id,
    'labelSnapshot', p_log.label_snapshot,
    'categorySnapshot', p_log.category_snapshot,
    'volumeMl', p_log.volume_ml,
    'abvPercent', p_log.abv_percent,
    'ethanolGrams', p_log.ethanol_grams,
    'consumedAt', p_log.consumed_at,
    'createdAt', p_log.created_at,
    'afterEnd', p_log.after_end,
    'idempotencyKey', p_log.idempotency_key,
    'deletedAt', p_log.deleted_at
  );
$$;

create or replace function private.water_log_json(p_log public.water_logs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_log.id,
    'nightId', p_log.night_id,
    'nightMemberId', p_log.night_member_id,
    'actorUserId', p_log.actor_user_id,
    'consumedAt', p_log.consumed_at,
    'createdAt', p_log.created_at,
    'idempotencyKey', p_log.idempotency_key,
    'deletedAt', p_log.deleted_at
  );
$$;

create or replace function private.alert_json(p_alert public.night_alerts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_alert.id,
    'nightId', p_alert.night_id,
    'nightMemberId', p_alert.night_member_id,
    'type', p_alert.type,
    'severity', p_alert.severity,
    'visibility', p_alert.visibility,
    'message', p_alert.message,
    'dedupeKey', p_alert.dedupe_key,
    'createdAt', p_alert.created_at,
    'expiresAt', p_alert.expires_at
  );
$$;

create or replace function private.build_night_snapshot(p_night_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_current_member uuid;
begin
  select m.id into v_current_member
  from public.night_members m
  where m.night_id = p_night_id
    and m.user_id = p_user_id
    and m.left_at is null;

  if v_current_member is null then
    raise exception 'Night not found.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'night', jsonb_build_object(
      'id', n.id,
      'hostUserId', n.host_user_id,
      'title', n.title,
      'status', n.status,
      'startsAt', n.starts_at,
      'initialEndsAt', n.initial_ends_at,
      'endsAt', n.ends_at,
      'endedAt', n.ended_at,
      'timezone', n.timezone
    ),
    'currentUserId', p_user_id,
    'currentMemberId', v_current_member,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'nightId', m.night_id,
          'userId', m.user_id,
          'displayName', m.display_name,
          'memberType', m.member_type,
          'role', m.role,
          'managedByUserId', m.managed_by_user_id,
          'joinedAt', m.joined_at,
          'leftAt', m.left_at,
          'planItems', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id,
              'nightMemberId', p.night_member_id,
              'label', p.label,
              'category', p.category,
              'volumeMl', p.volume_ml,
              'abvPercent', p.abv_percent,
              'plannedQuantity', p.planned_quantity,
              'isQuickLog', p.is_quick_log,
              'createdBy', p.created_by,
              'createdAt', p.created_at,
              'archivedAt', p.archived_at,
              'updatedAt', p.updated_at
            ) order by p.created_at, p.id)
            from public.drink_plan_items p
            where p.night_member_id = m.id and p.archived_at is null
          ), '[]'::jsonb),
          'drinkLogs', coalesce((
            select jsonb_agg(private.drink_log_json(d) order by d.consumed_at, d.id)
            from public.drink_logs d
            where d.night_member_id = m.id and d.deleted_at is null
          ), '[]'::jsonb),
          'waterLogs', coalesce((
            select jsonb_agg(private.water_log_json(w) order by w.consumed_at, w.id)
            from public.water_logs w
            where w.night_member_id = m.id and w.deleted_at is null
          ), '[]'::jsonb)
        ) order by (m.role = 'host') desc, m.joined_at, m.id
      )
      from public.night_members m where m.night_id = n.id
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(private.alert_json(a) order by a.created_at desc)
      from public.night_alerts a
      left join public.night_members affected on affected.id = a.night_member_id
      where a.night_id = n.id
        and (a.expires_at is null or a.expires_at > statement_timestamp())
        and (
          a.visibility = 'group'
          or affected.user_id = p_user_id
          or affected.managed_by_user_id = p_user_id
        )
    ), '[]'::jsonb),
    'endTimeChanges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nightId', c.night_id,
        'changedBy', c.changed_by,
        'previousEndsAt', c.previous_ends_at,
        'newEndsAt', c.new_ends_at,
        'effectiveAt', c.effective_at
      ) order by c.effective_at, c.id)
      from public.night_end_time_changes c where c.night_id = n.id
    ), '[]'::jsonb)
  ) into v_result
  from public.nights n
  where n.id = p_night_id;

  if v_result is null then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  return v_result;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_age_confirmed boolean := coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false);
begin
  if char_length(v_display_name) not between 1 and 60 then
    raise exception 'A valid display name is required.' using errcode = '22023';
  end if;
  if not v_age_confirmed then
    raise exception 'Adult confirmation is required.' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name);

  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, after_data)
  values (
    new.id,
    'profile.created',
    'profile',
    new.id,
    jsonb_build_object('display_name', v_display_name, 'adult_confirmed', true)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.get_night_snapshot(p_night_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

create or replace function public.get_active_nights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'status', n.status,
      'startsAt', n.starts_at,
      'endsAt', n.ends_at,
      'role', m.role,
      'lastActivityAt', greatest(
        n.updated_at,
        coalesce((select max(d.created_at) from public.drink_logs d where d.night_id = n.id), n.updated_at),
        coalesce((select max(w.created_at) from public.water_logs w where w.night_id = n.id), n.updated_at)
      )
    ) order by greatest(
      n.updated_at,
      coalesce((select max(d.created_at) from public.drink_logs d where d.night_id = n.id), n.updated_at),
      coalesce((select max(w.created_at) from public.water_logs w where w.night_id = n.id), n.updated_at)
    ) desc)
    from public.night_members m
    join public.nights n on n.id = m.night_id
    where m.user_id = v_actor and m.left_at is null and n.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.start_night_out(
  p_creation_key uuid,
  p_title text,
  p_ends_at timestamptz,
  p_timezone text,
  p_host_plan jsonb,
  p_guests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night_id uuid;
  v_member_id uuid;
  v_profile_name text;
  v_guest jsonb;
  v_guest_member_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_creation_key is null then
    raise exception 'A creation key is required.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Night title is invalid.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_timezone, ''))) not between 1 and 80 then
    raise exception 'Timezone is invalid.' using errcode = '22023';
  end if;
  begin
    perform v_now at time zone p_timezone;
  exception when invalid_parameter_value then
    raise exception 'Timezone is invalid.' using errcode = '22023';
  end;
  if p_ends_at <= v_now or p_ends_at > v_now + interval '24 hours' then
    raise exception 'Planned end must be later and within 24 hours.' using errcode = '22023';
  end if;
  perform private.validate_plan(p_host_plan);
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 20 then
    raise exception 'Guests must be an array of at most 20 people.' using errcode = '22023';
  end if;
  for v_guest in select value from jsonb_array_elements(p_guests)
  loop
    if char_length(btrim(coalesce(v_guest ->> 'displayName', ''))) not between 1 and 60 then
      raise exception 'Guest display name is invalid.' using errcode = '22023';
    end if;
    perform private.validate_plan(v_guest -> 'planItems');
  end loop;

  select n.id into v_night_id
  from public.nights n
  where n.host_user_id = v_actor and n.creation_key = p_creation_key;
  if v_night_id is not null then
    return jsonb_build_object(
      'nightId', v_night_id,
      'snapshot', private.build_night_snapshot(v_night_id, v_actor),
      'duplicate', true
    );
  end if;

  select p.display_name into v_profile_name from public.profiles p where p.id = v_actor;
  if v_profile_name is null then
    raise exception 'A valid profile is required.' using errcode = '22023';
  end if;

  insert into public.nights (
    host_user_id,
    creation_key,
    title,
    starts_at,
    initial_ends_at,
    ends_at,
    timezone,
    created_at,
    updated_at
  ) values (
    v_actor,
    p_creation_key,
    btrim(p_title),
    v_now,
    p_ends_at,
    p_ends_at,
    btrim(p_timezone),
    v_now,
    v_now
  )
  on conflict (host_user_id, creation_key) do nothing
  returning id into v_night_id;

  if v_night_id is null then
    select n.id into v_night_id
    from public.nights n
    where n.host_user_id = v_actor and n.creation_key = p_creation_key;
    return jsonb_build_object(
      'nightId', v_night_id,
      'snapshot', private.build_night_snapshot(v_night_id, v_actor),
      'duplicate', true
    );
  end if;

  insert into public.night_members (
    night_id, user_id, display_name, member_type, role, joined_at
  ) values (
    v_night_id, v_actor, v_profile_name, 'account', 'host', v_now
  ) returning id into v_member_id;

  perform private.insert_plan(v_member_id, v_actor, p_host_plan, v_now);

  for v_guest in select value from jsonb_array_elements(p_guests)
  loop
    insert into public.night_members (
      night_id,
      display_name,
      member_type,
      role,
      managed_by_user_id,
      joined_at
    ) values (
      v_night_id,
      btrim(v_guest ->> 'displayName'),
      'guest',
      'member',
      v_actor,
      v_now
    ) returning id into v_guest_member_id;

    perform private.insert_plan(v_guest_member_id, v_actor, v_guest -> 'planItems', v_now);
    insert into public.audit_events (
      night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
    ) values (
      v_night_id,
      v_actor,
      'guest.created',
      'night_member',
      v_guest_member_id,
      jsonb_build_object('display_name', btrim(v_guest ->> 'displayName')),
      v_now
    );
  end loop;

  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    v_night_id,
    v_actor,
    'night.started',
    'night',
    v_night_id,
    jsonb_build_object(
      'title', btrim(p_title),
      'starts_at', v_now,
      'initial_ends_at', p_ends_at,
      'timezone', btrim(p_timezone)
    ),
    v_now
  );

  return jsonb_build_object(
    'nightId', v_night_id,
    'snapshot', private.build_night_snapshot(v_night_id, v_actor),
    'duplicate', false
  );
end;
$$;

create or replace function public.replace_member_plan(p_member_id uuid, p_items jsonb)
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
  v_item jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform private.validate_plan(p_items);
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found then raise exception 'Member not found.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = v_member.night_id for update;
  if v_night.status <> 'active' then
    raise exception 'Ended nights are read-only.' using errcode = '55000';
  end if;
  if not private.is_current_night_member(v_night.id, v_actor) then
    raise exception 'Member not found.' using errcode = '42501';
  end if;
  if not (
    (v_member.member_type = 'account' and v_member.user_id = v_actor and v_member.left_at is null)
    or private.can_manage_member(v_member.id, v_actor)
  ) then
    raise exception 'You cannot edit this plan.' using errcode = '42501';
  end if;

  select coalesce(sum(round(p.volume_ml * (p.abv_percent / 100.0) * 0.789, 3) * p.planned_quantity), 0)
  into v_old_total
  from public.drink_plan_items p
  where p.night_member_id = v_member.id and p.archived_at is null;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_new_total := v_new_total + round(
      (v_item ->> 'volumeMl')::numeric * ((v_item ->> 'abvPercent')::numeric / 100.0) * 0.789,
      3
    ) * (v_item ->> 'plannedQuantity')::integer;
  end loop;

  update public.drink_plan_items
  set archived_at = v_now, is_quick_log = false, updated_at = v_now
  where night_member_id = v_member.id and archived_at is null;
  perform private.insert_plan(v_member.id, v_actor, p_items, v_now);

  if v_new_total > v_old_total + 0.01 then
    insert into public.audit_events (
      night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
    ) values (
      v_night.id,
      v_actor,
      'plan.increased',
      'night_member',
      v_member.id,
      jsonb_build_object('planned_ethanol_grams', round(v_old_total, 3)),
      jsonb_build_object('planned_ethanol_grams', round(v_new_total, 3)),
      v_now
    );
  end if;
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

create or replace function public.add_managed_guest(
  p_night_id uuid,
  p_display_name text,
  p_plan jsonb
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
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Guest display name is invalid.' using errcode = '22023';
  end if;
  perform private.validate_plan(p_plan);
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  if v_night.status <> 'active' then raise exception 'Ended nights are read-only.' using errcode = '55000'; end if;
  if not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  if (select count(*) from public.night_members where night_id = p_night_id and member_type = 'guest' and left_at is null) >= 20 then
    raise exception 'This night already has the maximum managed guests.' using errcode = '22023';
  end if;

  insert into public.night_members (
    night_id, display_name, member_type, role, managed_by_user_id, joined_at
  ) values (
    p_night_id, btrim(p_display_name), 'guest', 'member', v_actor, v_now
  ) returning id into v_member_id;
  perform private.insert_plan(v_member_id, v_actor, p_plan, v_now);
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    p_night_id, v_actor, 'guest.created', 'night_member', v_member_id,
    jsonb_build_object('display_name', btrim(p_display_name)), v_now
  );
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

create or replace function public.remove_managed_guest(p_member_id uuid)
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
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.night_members where id = p_member_id for update;
  if not found then raise exception 'Guest not found.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = v_member.night_id for update;
  if v_night.status <> 'active' or not private.can_manage_member(v_member.id, v_actor) then
    raise exception 'Guest not found.' using errcode = '42501';
  end if;
  update public.night_members set left_at = v_now where id = v_member.id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
  ) values (
    v_night.id, v_actor, 'guest.removed', 'night_member', v_member.id,
    jsonb_build_object('left_at', v_member.left_at), jsonb_build_object('left_at', v_now), v_now
  );
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

create or replace function public.create_night_invite(
  p_night_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer default null
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
  v_invite_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token hash is invalid.' using errcode = '22023'; end if;
  if p_expires_at <= v_now or p_expires_at > v_now + interval '7 days' then
    raise exception 'Invite expiry is invalid.' using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100 then
    raise exception 'Invite use limit is invalid.' using errcode = '22023';
  end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or v_night.status <> 'active'
    or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;

  insert into public.night_invites (
    night_id, token_hash, created_by, expires_at, max_uses, created_at
  ) values (
    p_night_id, p_token_hash, v_actor, p_expires_at, p_max_uses, v_now
  ) returning id into v_invite_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    p_night_id, v_actor, 'invite.created', 'night_invite', v_invite_id,
    jsonb_build_object('expires_at', p_expires_at, 'max_uses', p_max_uses), v_now
  );
  return jsonb_build_object('inviteId', v_invite_id, 'expiresAt', p_expires_at);
end;
$$;

create or replace function public.rotate_night_invite(
  p_night_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer default null
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
  v_invite_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token hash is invalid.' using errcode = '22023'; end if;
  if p_expires_at <= v_now or p_expires_at > v_now + interval '7 days' then
    raise exception 'Invite expiry is invalid.' using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100 then
    raise exception 'Invite use limit is invalid.' using errcode = '22023';
  end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or v_night.status <> 'active'
    or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;

  update public.night_invites set revoked_at = v_now
  where night_id = p_night_id and revoked_at is null;
  insert into public.night_invites (
    night_id, token_hash, created_by, expires_at, max_uses, created_at
  ) values (
    p_night_id, p_token_hash, v_actor, p_expires_at, p_max_uses, v_now
  ) returning id into v_invite_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
  ) values (
    p_night_id, v_actor, 'invite.rotated', 'night_invite', v_invite_id,
    jsonb_build_object('expires_at', p_expires_at, 'max_uses', p_max_uses), v_now
  );
  return jsonb_build_object('inviteId', v_invite_id, 'expiresAt', p_expires_at);
end;
$$;

create or replace function public.revoke_night_invite(p_night_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.nights n
    where n.id = p_night_id and n.host_user_id = v_actor
  ) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  update public.night_invites set revoked_at = v_now
  where night_id = p_night_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_events (
      night_id, actor_user_id, action, entity_type, entity_id, after_data, created_at
    ) values (
      p_night_id, v_actor, 'invite.revoked', 'night_invite', null,
      jsonb_build_object('revoked_count', v_count), v_now
    );
  end if;
  return jsonb_build_object('revoked', true);
end;
$$;

create or replace function public.get_invite_preview(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_invite public.night_invites%rowtype;
  v_night public.nights%rowtype;
  v_host_name text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;
  select * into v_invite from public.night_invites where token_hash = p_token_hash;
  if not found then return jsonb_build_object('valid', false, 'reason', 'invalid'); end if;
  select * into v_night from public.nights where id = v_invite.night_id;
  if v_night.status = 'ended' then return jsonb_build_object('valid', false, 'reason', 'ended'); end if;
  if v_invite.revoked_at is not null then return jsonb_build_object('valid', false, 'reason', 'revoked'); end if;
  if v_invite.expires_at <= v_now then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'full');
  end if;
  select p.display_name into v_host_name from public.profiles p where p.id = v_night.host_user_id;
  return jsonb_build_object(
    'valid', true,
    'nightTitle', v_night.title,
    'hostDisplayName', v_host_name,
    'startsAt', v_night.starts_at,
    'endsAt', v_night.ends_at
  );
end;
$$;

create or replace function public.redeem_night_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_invite public.night_invites%rowtype;
  v_night public.nights%rowtype;
  v_member public.night_members%rowtype;
  v_profile_name text;
  v_joined boolean := false;
  v_reactivated boolean := false;
  v_needs_plan boolean;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation unavailable.' using errcode = '22023';
  end if;
  select * into v_invite from public.night_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'Invitation unavailable.' using errcode = '22023'; end if;
  select * into v_night from public.nights where id = v_invite.night_id for update;
  if v_night.status = 'ended' or v_invite.revoked_at is not null or v_invite.expires_at <= v_now then
    raise exception 'Invitation unavailable.' using errcode = '22023';
  end if;

  select * into v_member
  from public.night_members
  where night_id = v_night.id and user_id = v_actor
  for update;

  if found then
    if v_member.left_at is not null then
      update public.night_members set left_at = null where id = v_member.id
      returning * into v_member;
      v_reactivated := true;
    end if;
  else
    if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
      raise exception 'Invitation unavailable.' using errcode = '22023';
    end if;
    select p.display_name into v_profile_name from public.profiles p where p.id = v_actor;
    if v_profile_name is null then raise exception 'A valid profile is required.' using errcode = '22023'; end if;
    insert into public.night_members (
      night_id, user_id, display_name, member_type, role, joined_at
    ) values (
      v_night.id, v_actor, v_profile_name, 'account', 'member', v_now
    ) returning * into v_member;
    update public.night_invites set use_count = use_count + 1 where id = v_invite.id;
    v_joined := true;
  end if;

  select not exists (
    select 1 from public.drink_plan_items p
    where p.night_member_id = v_member.id and p.archived_at is null
  ) into v_needs_plan;

  return jsonb_build_object(
    'nightId', v_night.id,
    'memberId', v_member.id,
    'joined', v_joined,
    'reactivated', v_reactivated,
    'needsPlan', v_needs_plan
  );
end;
$$;

create or replace function public.log_drink(
  p_target_member_id uuid,
  p_plan_item_id uuid default null,
  p_custom_drink jsonb default null,
  p_consumed_at timestamptz default null,
  p_idempotency_key uuid default null,
  p_ack_plan_exceeded boolean default false,
  p_ack_after_end boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_target public.night_members%rowtype;
  v_actor_member public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_plan_item public.drink_plan_items%rowtype;
  v_existing public.drink_logs%rowtype;
  v_log public.drink_logs%rowtype;
  v_label text;
  v_category text;
  v_volume numeric;
  v_abv numeric;
  v_ethanol numeric;
  v_plan_total numeric;
  v_logged_total numeric;
  v_projected_total numeric;
  v_applicable_end timestamptz;
  v_after_end boolean;
  v_plan_exceeded boolean;
  v_warnings jsonb := '[]'::jsonb;
  v_personal_total numeric;
  v_group_total numeric;
  v_alerts jsonb;
  v_plan_revision text;
begin
  if v_actor is null then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'unauthenticated', 'message', 'Sign in again to sync this log.'
    );
  end if;
  if p_idempotency_key is null or p_consumed_at is null then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'invalid_input', 'message', 'This log is missing required information.'
    );
  end if;

  select * into v_existing
  from public.drink_logs
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'status', 'duplicate', 'log', private.drink_log_json(v_existing), 'alerts', '[]'::jsonb
    );
  end if;

  if p_consumed_at > v_now + interval '5 minutes' then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'future_time', 'message', 'The drink time is too far in the future.'
    );
  end if;
  if p_consumed_at < v_now - interval '7 days' then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'too_old', 'message', 'This queued log is too old to sync.'
    );
  end if;

  select * into v_target from public.night_members where id = p_target_member_id for update;
  if not found then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'member_unavailable', 'message', 'This participant is no longer available.'
    );
  end if;
  select * into v_night from public.nights where id = v_target.night_id for update;
  if p_consumed_at < v_night.starts_at then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'before_night', 'message', 'The drink time is before this night began.'
    );
  end if;

  select * into v_actor_member
  from public.night_members
  where night_id = v_night.id
    and user_id = v_actor
    and member_type = 'account'
    and joined_at <= p_consumed_at
    and (left_at is null or p_consumed_at <= left_at);
  if not found or (v_night.status = 'active' and v_actor_member.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;
  if not (
    (
      v_target.member_type = 'account'
      and v_target.user_id = v_actor
      and v_target.joined_at <= p_consumed_at
      and (v_target.left_at is null or p_consumed_at <= v_target.left_at)
    )
    or (
      v_target.member_type = 'guest'
      and v_target.managed_by_user_id = v_actor
      and v_night.host_user_id = v_actor
      and v_target.joined_at <= p_consumed_at
      and (v_target.left_at is null or p_consumed_at <= v_target.left_at)
    )
  ) or (v_night.status = 'active' and v_target.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;

  if v_night.status = 'ended' then
    if p_consumed_at > v_night.ended_at then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'after_actual_end', 'message', 'This entry occurred after the night was ended.'
      );
    end if;
    if v_now > v_night.ended_at + interval '24 hours' then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'post_end_grace_expired', 'message', 'The 24-hour post-end sync period has expired.'
      );
    end if;
  end if;

  if not exists (
    select 1 from public.drink_plan_items p
    where p.night_member_id = v_target.id and p.archived_at is null
  ) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'plan_required', 'message', 'Create a personal plan before logging alcohol.'
    );
  end if;

  if p_plan_item_id is not null then
    if p_custom_drink is not null then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'mixed_drink_input', 'message', 'Choose either a plan item or a custom drink.'
      );
    end if;
    select * into v_plan_item
    from public.drink_plan_items p
    where p.id = p_plan_item_id and p.night_member_id = v_target.id;
    if not found
      or v_plan_item.created_at > p_consumed_at
      or (v_plan_item.archived_at is not null and p_consumed_at > v_plan_item.archived_at) then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'plan_version_unavailable', 'message', 'The selected plan version was not valid at that time.'
      );
    end if;
    v_label := v_plan_item.label;
    v_category := v_plan_item.category;
    v_volume := v_plan_item.volume_ml;
    v_abv := v_plan_item.abv_percent;
  else
    if p_custom_drink is null or jsonb_typeof(p_custom_drink) <> 'object' then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'drink_required', 'message', 'Choose a drink to log.'
      );
    end if;
    v_label := btrim(coalesce(p_custom_drink ->> 'label', ''));
    v_category := coalesce(p_custom_drink ->> 'category', '');
    begin
      v_volume := (p_custom_drink ->> 'volume_ml')::numeric;
      v_abv := (p_custom_drink ->> 'abv_percent')::numeric;
    exception when others then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'invalid_custom_drink', 'message', 'The custom drink details are invalid.'
      );
    end;
    if char_length(v_label) not between 1 and 60
      or v_category not in ('beer', 'wine', 'spirit', 'cocktail', 'other')
      or v_volume not between 1 and 2000
      or v_abv <= 0 or v_abv > 95 then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'invalid_custom_drink', 'message', 'The custom drink details are invalid.'
      );
    end if;
  end if;

  v_ethanol := round(v_volume * (v_abv / 100.0) * 0.789, 3);
  select coalesce(sum(round(p.volume_ml * (p.abv_percent / 100.0) * 0.789, 3) * p.planned_quantity), 0)
  into v_plan_total
  from public.drink_plan_items p
  where p.night_member_id = v_target.id and p.archived_at is null;
  select coalesce(sum(d.ethanol_grams), 0) into v_logged_total
  from public.drink_logs d
  where d.night_member_id = v_target.id and d.deleted_at is null;
  v_projected_total := v_logged_total + v_ethanol;
  v_plan_exceeded := v_projected_total > v_plan_total + 0.01;
  v_applicable_end := private.applicable_end_at(v_night.id, v_night.initial_ends_at, p_consumed_at);
  v_after_end := p_consumed_at > v_applicable_end;

  if v_plan_exceeded and not p_ack_plan_exceeded then
    v_warnings := v_warnings || jsonb_build_array('plan_exceeded');
  end if;
  if v_after_end and not p_ack_after_end then
    v_warnings := v_warnings || jsonb_build_array('after_end');
  end if;
  if jsonb_array_length(v_warnings) > 0 then
    return jsonb_build_object(
      'status', 'confirmation_required',
      'warnings', v_warnings,
      'message', case
        when jsonb_array_length(v_warnings) = 2 then 'This is beyond your plan and your planned night has ended. Log it anyway?'
        when v_warnings ? 'plan_exceeded' then 'This is beyond the plan you set earlier. Log it anyway?'
        else 'Your planned night has ended. Log this drink anyway?'
      end
    );
  end if;

  begin
    insert into public.drink_logs (
      night_id,
      night_member_id,
      actor_user_id,
      plan_item_id,
      label_snapshot,
      category_snapshot,
      volume_ml,
      abv_percent,
      consumed_at,
      created_at,
      after_end,
      idempotency_key
    ) values (
      v_night.id,
      v_target.id,
      v_actor,
      p_plan_item_id,
      v_label,
      v_category,
      v_volume,
      v_abv,
      p_consumed_at,
      v_now,
      v_after_end,
      p_idempotency_key
    ) returning * into v_log;
  exception when unique_violation then
    select * into v_existing
    from public.drink_logs
    where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'status', 'duplicate', 'log', private.drink_log_json(v_existing), 'alerts', '[]'::jsonb
      );
    end if;
    raise;
  end;

  if p_consumed_at <= v_now and v_now - p_consumed_at <= interval '15 minutes' then
    select coalesce(sum(d.ethanol_grams), 0) into v_personal_total
    from public.drink_logs d
    where d.night_member_id = v_target.id
      and d.deleted_at is null
      and d.consumed_at between p_consumed_at - interval '60 minutes' and p_consumed_at;
    if v_personal_total >= 20 and not exists (
      select 1 from public.night_alerts a
      where a.night_member_id = v_target.id
        and a.type = 'personal_pace'
        and a.created_at > v_now - interval '60 minutes'
    ) then
      insert into public.night_alerts (
        night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
        expires_at
      ) values (
        v_night.id,
        v_target.id,
        'personal_pace',
        'caution',
        'private',
        'You have logged drinks fairly quickly. Consider pausing, drinking water and checking how you feel.',
        'personal_pace:' || v_target.id || ':' || floor(extract(epoch from v_now) / 3600)::bigint,
        v_now,
        v_now + interval '60 minutes'
      ) on conflict (dedupe_key) do nothing;
    end if;

    select coalesce(sum(d.ethanol_grams), 0) into v_group_total
    from public.drink_logs d
    where d.night_member_id = v_target.id
      and d.deleted_at is null
      and d.consumed_at between p_consumed_at - interval '120 minutes' and p_consumed_at;
    if v_group_total >= 40 and not exists (
      select 1 from public.night_alerts a
      where a.night_member_id = v_target.id
        and a.type = 'group_check_in'
        and a.created_at > v_now - interval '120 minutes'
    ) then
      insert into public.night_alerts (
        night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
        expires_at
      ) values (
        v_night.id,
        v_target.id,
        'group_check_in',
        'caution',
        'group',
        v_target.display_name || ' has logged several drinks in a short period. Please check in with them.',
        'group_check_in:' || v_target.id || ':' || floor(extract(epoch from v_now) / 7200)::bigint,
        v_now,
        v_now + interval '120 minutes'
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;

  if abs(v_projected_total - v_plan_total) <= 0.01 then
    select coalesce(max(p.created_at)::text, '0') into v_plan_revision
    from public.drink_plan_items p
    where p.night_member_id = v_target.id and p.archived_at is null;
    insert into public.night_alerts (
      night_id, night_member_id, type, severity, visibility, message, dedupe_key, created_at,
      expires_at
    ) values (
      v_night.id,
      v_target.id,
      'plan_reached',
      'caution',
      'private',
      'You have reached your personal plan. Consider stopping here.',
      'plan_reached:' || v_target.id || ':' || v_plan_revision,
      v_now,
      null
    ) on conflict (dedupe_key) do nothing;
  end if;

  select coalesce(jsonb_agg(private.alert_json(a) order by a.created_at), '[]'::jsonb)
  into v_alerts
  from public.night_alerts a
  where a.night_member_id = v_target.id and a.created_at = v_now;

  return jsonb_build_object(
    'status', 'created', 'log', private.drink_log_json(v_log), 'alerts', v_alerts
  );
end;
$$;

create or replace function public.log_water(
  p_target_member_id uuid,
  p_consumed_at timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_target public.night_members%rowtype;
  v_actor_member public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_existing public.water_logs%rowtype;
  v_log public.water_logs%rowtype;
begin
  if v_actor is null then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'unauthenticated', 'message', 'Sign in again to sync this log.'
    );
  end if;
  select * into v_existing
  from public.water_logs
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'log', private.water_log_json(v_existing));
  end if;
  if p_consumed_at is null or p_idempotency_key is null
    or p_consumed_at > v_now + interval '5 minutes'
    or p_consumed_at < v_now - interval '7 days' then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'invalid_time', 'message', 'The water log time is invalid.'
    );
  end if;
  select * into v_target from public.night_members where id = p_target_member_id for update;
  if not found then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'member_unavailable', 'message', 'This participant is no longer available.'
    );
  end if;
  select * into v_night from public.nights where id = v_target.night_id for update;
  if p_consumed_at < v_night.starts_at then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'before_night', 'message', 'The water time is before this night began.'
    );
  end if;
  select * into v_actor_member
  from public.night_members
  where night_id = v_night.id
    and user_id = v_actor
    and joined_at <= p_consumed_at
    and (left_at is null or p_consumed_at <= left_at);
  if not found or (v_night.status = 'active' and v_actor_member.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;
  if not (
    (v_target.member_type = 'account' and v_target.user_id = v_actor)
    or (
      v_target.member_type = 'guest'
      and v_target.managed_by_user_id = v_actor
      and v_night.host_user_id = v_actor
    )
  )
  or v_target.joined_at > p_consumed_at
  or (v_target.left_at is not null and p_consumed_at > v_target.left_at)
  or (v_night.status = 'active' and v_target.left_at is not null) then
    return jsonb_build_object(
      'status', 'permanently_rejected', 'code', 'permission_denied', 'message', 'You are not allowed to log for this participant.'
    );
  end if;
  if v_night.status = 'ended' then
    if p_consumed_at > v_night.ended_at then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'after_actual_end', 'message', 'This entry occurred after the night was ended.'
      );
    end if;
    if v_now > v_night.ended_at + interval '24 hours' then
      return jsonb_build_object(
        'status', 'permanently_rejected', 'code', 'post_end_grace_expired', 'message', 'The 24-hour post-end sync period has expired.'
      );
    end if;
  end if;

  begin
    insert into public.water_logs (
      night_id, night_member_id, actor_user_id, consumed_at, created_at, idempotency_key
    ) values (
      v_night.id, v_target.id, v_actor, p_consumed_at, v_now, p_idempotency_key
    ) returning * into v_log;
  exception when unique_violation then
    select * into v_existing from public.water_logs
    where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('status', 'duplicate', 'log', private.water_log_json(v_existing));
    end if;
    raise;
  end;
  return jsonb_build_object('status', 'created', 'log', private.water_log_json(v_log));
end;
$$;

create or replace function public.find_drink_by_idempotency_key(p_idempotency_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_log public.drink_logs%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_log from public.drink_logs
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', 'duplicate', 'log', private.drink_log_json(v_log), 'alerts', '[]'::jsonb
  );
end;
$$;

create or replace function public.soft_delete_activity(p_log_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_drink public.drink_logs%rowtype;
  v_water public.water_logs%rowtype;
  v_target public.night_members%rowtype;
  v_night public.nights%rowtype;
  v_created_at timestamptz;
  v_night_id uuid;
  v_member_id uuid;
  v_log_actor uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_kind = 'alcohol' then
    select * into v_drink from public.drink_logs where id = p_log_id for update;
    if not found then raise exception 'Log not found.' using errcode = '42501'; end if;
    if v_drink.deleted_at is not null then return jsonb_build_object('deleted', true); end if;
    v_created_at := v_drink.created_at;
    v_night_id := v_drink.night_id;
    v_member_id := v_drink.night_member_id;
    v_log_actor := v_drink.actor_user_id;
  elsif p_kind = 'water' then
    select * into v_water from public.water_logs where id = p_log_id for update;
    if not found then raise exception 'Log not found.' using errcode = '42501'; end if;
    if v_water.deleted_at is not null then return jsonb_build_object('deleted', true); end if;
    v_created_at := v_water.created_at;
    v_night_id := v_water.night_id;
    v_member_id := v_water.night_member_id;
    v_log_actor := v_water.actor_user_id;
  else
    raise exception 'Activity kind is invalid.' using errcode = '22023';
  end if;
  if v_now > v_created_at + interval '15 minutes' then
    raise exception 'The 15-minute correction window has closed.' using errcode = '55000';
  end if;
  select * into v_target from public.night_members where id = v_member_id;
  select * into v_night from public.nights where id = v_night_id;
  if not exists (
    select 1 from public.night_members
    where night_id = v_night_id and user_id = v_actor and left_at is null
  ) then
    raise exception 'Log not found.' using errcode = '42501';
  end if;
  if not (
    (
      v_target.member_type = 'account'
      and v_target.user_id = v_actor
      and v_log_actor = v_actor
      and v_target.left_at is null
    )
    or (
      v_target.member_type = 'guest'
      and v_target.managed_by_user_id = v_actor
      and v_night.host_user_id = v_actor
      and v_log_actor = v_actor
      and v_target.left_at is null
    )
  ) then
    raise exception 'Log not found.' using errcode = '42501';
  end if;
  if p_kind = 'alcohol' then
    update public.drink_logs set deleted_at = v_now where id = p_log_id;
  else
    update public.water_logs set deleted_at = v_now where id = p_log_id;
  end if;
  -- Deleted rows become invisible under RLS, so this visible parent event invalidates other clients.
  update public.nights set updated_at = v_now where id = v_night_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
  ) values (
    v_night_id, v_actor, 'activity.soft_deleted', p_kind || '_log', p_log_id,
    jsonb_build_object('deleted_at', null), jsonb_build_object('deleted_at', v_now), v_now
  );
  return jsonb_build_object('deleted', true);
end;
$$;

create or replace function public.extend_night(p_night_id uuid, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night public.nights%rowtype;
  v_new_end timestamptz;
  v_change_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_minutes not between 5 and 120 then raise exception 'Extension length is invalid.' using errcode = '22023'; end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  if v_night.status <> 'active' then raise exception 'Ended nights cannot be extended.' using errcode = '55000'; end if;
  v_new_end := v_night.ends_at + make_interval(mins => p_minutes);
  if v_new_end > v_night.starts_at + interval '24 hours' then
    raise exception 'The night cannot extend beyond 24 hours from its start.' using errcode = '22023';
  end if;
  update public.nights set ends_at = v_new_end, updated_at = v_now where id = v_night.id;
  insert into public.night_end_time_changes (
    night_id, changed_by, previous_ends_at, new_ends_at, effective_at, created_at
  ) values (
    v_night.id, v_actor, v_night.ends_at, v_new_end, v_now, v_now
  ) returning id into v_change_id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
  ) values (
    v_night.id, v_actor, 'night.extended', 'night_end_time_change', v_change_id,
    jsonb_build_object('ends_at', v_night.ends_at), jsonb_build_object('ends_at', v_new_end), v_now
  );
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

create or replace function public.end_night(p_night_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night public.nights%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = p_night_id for update;
  if not found or v_night.host_user_id <> v_actor or not private.is_current_night_member(p_night_id, v_actor) then
    raise exception 'Night not found.' using errcode = '42501';
  end if;
  if v_night.status = 'ended' then return private.build_night_snapshot(v_night.id, v_actor); end if;
  update public.nights
  set status = 'ended', ended_at = v_now, updated_at = v_now
  where id = v_night.id;
  insert into public.audit_events (
    night_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at
  ) values (
    v_night.id, v_actor, 'night.ended', 'night', v_night.id,
    jsonb_build_object('status', 'active', 'ended_at', null),
    jsonb_build_object('status', 'ended', 'ended_at', v_now), v_now
  );
  return private.build_night_snapshot(v_night.id, v_actor);
end;
$$;

create or replace function public.leave_night(p_night_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_night public.nights%rowtype;
  v_member public.night_members%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_night from public.nights where id = p_night_id for update;
  select * into v_member from public.night_members
  where night_id = p_night_id and user_id = v_actor for update;
  if not found or v_member.left_at is not null then raise exception 'Night not found.' using errcode = '42501'; end if;
  if v_night.status <> 'active' then raise exception 'This night has already ended.' using errcode = '55000'; end if;
  if v_night.host_user_id = v_actor or v_member.role = 'host' then
    raise exception 'The host must end the active night and cannot leave it.' using errcode = '55000';
  end if;
  update public.night_members set left_at = v_now where id = v_member.id;
  return jsonb_build_object('left', true);
end;
$$;

create or replace function public.update_night_title(p_night_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Night title is invalid.' using errcode = '22023';
  end if;
  update public.nights
  set title = btrim(p_title)
  where id = p_night_id and host_user_id = v_actor and status = 'active';
  if not found then raise exception 'Night not found.' using errcode = '42501'; end if;
  return private.build_night_snapshot(p_night_id, v_actor);
end;
$$;

create policy profiles_select_shared_night
on public.profiles for select
to authenticated
using ((select private.can_read_profile(id, (select auth.uid()))));

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy nights_select_current_members
on public.nights for select
to authenticated
using ((select private.is_current_night_member(id, (select auth.uid()))));

create policy night_end_time_changes_select_current_members
on public.night_end_time_changes for select
to authenticated
using ((select private.is_current_night_member(night_id, (select auth.uid()))));

create policy night_members_select_shared_night
on public.night_members for select
to authenticated
using ((select private.is_current_night_member(night_id, (select auth.uid()))));

create policy drink_plan_items_select_shared_night
on public.drink_plan_items for select
to authenticated
using (
  exists (
    select 1 from public.night_members m
    where m.id = drink_plan_items.night_member_id
      and (select private.is_current_night_member(m.night_id, (select auth.uid())))
  )
);

create policy drink_logs_select_shared_night
on public.drink_logs for select
to authenticated
using (
  deleted_at is null
  and (select private.is_current_night_member(night_id, (select auth.uid())))
);

create policy water_logs_select_shared_night
on public.water_logs for select
to authenticated
using (
  deleted_at is null
  and (select private.is_current_night_member(night_id, (select auth.uid())))
);

create policy night_alerts_select_authorized
on public.night_alerts for select
to authenticated
using (
  (select private.is_current_night_member(night_id, (select auth.uid())))
  and (
    visibility = 'group'
    or exists (
      select 1 from public.night_members affected
      where affected.id = night_alerts.night_member_id
        and (
          affected.user_id = (select auth.uid())
          or affected.managed_by_user_id = (select auth.uid())
        )
    )
  )
);

-- Explicit Data API privileges for projects using opt-in table exposure.
grant usage on schema public to anon, authenticated;
revoke all on table
  public.profiles,
  public.nights,
  public.night_end_time_changes,
  public.night_members,
  public.drink_plan_items,
  public.drink_logs,
  public.water_logs,
  public.night_invites,
  public.night_alerts,
  public.audit_events
from anon, authenticated;
grant select on table
  public.profiles,
  public.nights,
  public.night_end_time_changes,
  public.night_members,
  public.drink_plan_items,
  public.drink_logs,
  public.water_logs,
  public.night_alerts
to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- No browser role receives table privileges on raw invite or audit rows.
revoke all on public.night_invites from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.validate_night_member() from public, anon, authenticated;
revoke execute on function private.protect_extension_history() from public, anon, authenticated;
revoke execute on function private.protect_plan_version() from public, anon, authenticated;
revoke execute on function private.protect_drink_log() from public, anon, authenticated;
revoke execute on function private.protect_water_log() from public, anon, authenticated;
revoke execute on function private.validate_plan(jsonb) from public, anon, authenticated;
revoke execute on function private.insert_plan(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function private.drink_log_json(public.drink_logs) from public, anon, authenticated;
revoke execute on function private.water_log_json(public.water_logs) from public, anon, authenticated;
revoke execute on function private.alert_json(public.night_alerts) from public, anon, authenticated;
revoke execute on function private.build_night_snapshot(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

grant usage on schema private to authenticated;
revoke execute on function private.is_current_night_member(uuid, uuid) from public, anon;
revoke execute on function private.can_manage_member(uuid, uuid) from public, anon;
revoke execute on function private.can_read_profile(uuid, uuid) from public, anon;
revoke execute on function private.applicable_end_at(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.is_current_night_member(uuid, uuid) to authenticated;
grant execute on function private.can_manage_member(uuid, uuid) to authenticated;
grant execute on function private.can_read_profile(uuid, uuid) to authenticated;

revoke execute on function public.get_night_snapshot(uuid) from public, anon;
revoke execute on function public.get_active_nights() from public, anon;
revoke execute on function public.start_night_out(uuid, text, timestamptz, text, jsonb, jsonb) from public, anon;
revoke execute on function public.replace_member_plan(uuid, jsonb) from public, anon;
revoke execute on function public.add_managed_guest(uuid, text, jsonb) from public, anon;
revoke execute on function public.remove_managed_guest(uuid) from public, anon;
revoke execute on function public.create_night_invite(uuid, text, timestamptz, integer) from public, anon;
revoke execute on function public.rotate_night_invite(uuid, text, timestamptz, integer) from public, anon;
revoke execute on function public.revoke_night_invite(uuid) from public, anon;
revoke execute on function public.redeem_night_invite(text) from public, anon;
revoke execute on function public.log_drink(uuid, uuid, jsonb, timestamptz, uuid, boolean, boolean) from public, anon;
revoke execute on function public.log_water(uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.find_drink_by_idempotency_key(uuid) from public, anon;
revoke execute on function public.soft_delete_activity(uuid, text) from public, anon;
revoke execute on function public.extend_night(uuid, integer) from public, anon;
revoke execute on function public.end_night(uuid) from public, anon;
revoke execute on function public.leave_night(uuid) from public, anon;
revoke execute on function public.update_night_title(uuid, text) from public, anon;

grant execute on function public.get_night_snapshot(uuid) to authenticated;
grant execute on function public.get_active_nights() to authenticated;
grant execute on function public.start_night_out(uuid, text, timestamptz, text, jsonb, jsonb) to authenticated;
grant execute on function public.replace_member_plan(uuid, jsonb) to authenticated;
grant execute on function public.add_managed_guest(uuid, text, jsonb) to authenticated;
grant execute on function public.remove_managed_guest(uuid) to authenticated;
grant execute on function public.create_night_invite(uuid, text, timestamptz, integer) to authenticated;
grant execute on function public.rotate_night_invite(uuid, text, timestamptz, integer) to authenticated;
grant execute on function public.revoke_night_invite(uuid) to authenticated;
grant execute on function public.redeem_night_invite(text) to authenticated;
grant execute on function public.log_drink(uuid, uuid, jsonb, timestamptz, uuid, boolean, boolean) to authenticated;
grant execute on function public.log_water(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.find_drink_by_idempotency_key(uuid) to authenticated;
grant execute on function public.soft_delete_activity(uuid, text) to authenticated;
grant execute on function public.extend_night(uuid, integer) to authenticated;
grant execute on function public.end_night(uuid) to authenticated;
grant execute on function public.leave_night(uuid) to authenticated;
grant execute on function public.update_night_title(uuid, text) to authenticated;

revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

alter table public.nights replica identity full;
alter table public.night_members replica identity full;
alter table public.drink_plan_items replica identity full;
alter table public.drink_logs replica identity full;
alter table public.water_logs replica identity full;
alter table public.night_alerts replica identity full;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'nights',
    'night_members',
    'drink_plan_items',
    'drink_logs',
    'water_logs',
    'night_alerts'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

commit;
