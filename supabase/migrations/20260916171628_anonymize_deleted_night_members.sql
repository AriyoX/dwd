-- Preserve shared-night history when a non-host account is deleted while
-- removing the account linkage and stored display name. Host deletion remains
-- restricted because a shared night cannot safely exist without an owner.
begin;

alter table public.night_members
  drop constraint night_members_user_id_fkey;
alter table public.drink_plan_items
  drop constraint drink_plan_items_created_by_fkey;
alter table public.drink_logs
  drop constraint drink_logs_actor_user_id_fkey;
alter table public.water_logs
  drop constraint water_logs_actor_user_id_fkey;
alter table public.support_requests
  drop constraint support_requests_user_id_fkey;

alter table public.drink_plan_items alter column created_by drop not null;
alter table public.drink_logs alter column actor_user_id drop not null;
alter table public.water_logs alter column actor_user_id drop not null;

alter table public.night_members
  drop constraint night_members_kind_consistency;
alter table public.night_members
  add constraint night_members_kind_consistency check (
    (
      member_type = 'account'
      and managed_by_user_id is null
      and (
        user_id is not null
        or (
          user_id is null
          and role = 'member'
          and left_at is not null
          and display_name = 'Deleted user'
          and display_name_at_end = 'Deleted user'
        )
      )
    )
    or (
      member_type = 'guest'
      and user_id is null
      and managed_by_user_id is not null
      and role = 'member'
    )
  );

-- Immutable records may clear only the deleted account reference. Their
-- historical content remains protected from every other mutation.
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
    or (
      new.created_by is distinct from old.created_by
      and not (old.created_by is not null and new.created_by is null)
    )
    or new.created_at is distinct from old.created_at then
    raise exception 'Plan content is versioned and cannot be mutated.' using errcode = '55000';
  end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'An archived plan version cannot be restored.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.protect_drink_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.night_id is distinct from old.night_id
    or new.night_member_id is distinct from old.night_member_id
    or (
      new.actor_user_id is distinct from old.actor_user_id
      and not (old.actor_user_id is not null and new.actor_user_id is null)
    )
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

create or replace function private.protect_water_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.night_id is distinct from old.night_id
    or new.night_member_id is distinct from old.night_member_id
    or (
      new.actor_user_id is distinct from old.actor_user_id
      and not (old.actor_user_id is not null and new.actor_user_id is null)
    )
    or new.consumed_at is distinct from old.consumed_at
    or new.created_at is distinct from old.created_at
    or new.idempotency_key is distinct from old.idempotency_key
    or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Water logs are immutable except for first soft deletion.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.anonymize_deleted_account_member()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_name text := old.display_name;
  v_end_name text := coalesce(old.display_name_at_end, old.display_name);
begin
  if old.member_type = 'account'
    and old.user_id is not null
    and new.user_id is null then
    if old.role = 'host' then
      raise exception 'Host account deletion requires shared-night ownership review.'
        using errcode = '23503';
    end if;

    new.display_name := 'Deleted user';
    new.display_name_at_end := 'Deleted user';
    new.left_at := coalesce(old.left_at, clock_timestamp());
    new.managed_by_user_id := null;

    update public.night_alerts
    set message = replace(replace(message, v_name, 'A participant'), v_end_name, 'A participant')
    where night_member_id = old.id;

    update public.notification_events
    set
      title = case
        when sender_user_id = old.user_id then
          replace(replace(title, v_name, 'Someone'), v_end_name, 'Someone')
        else
          replace(replace(title, v_name, 'a participant'), v_end_name, 'a participant')
      end,
      body = case
        when sender_user_id = old.user_id then
          replace(replace(body, v_name, 'Someone'), v_end_name, 'Someone')
        else
          replace(replace(body, v_name, 'a participant'), v_end_name, 'a participant')
      end
    where target_member_id = old.id or sender_user_id = old.user_id;
  end if;
  return new;
end;
$$;

create trigger night_members_anonymize_deleted_account
before update of user_id on public.night_members
for each row execute function private.anonymize_deleted_account_member();

create or replace function private.scrub_deleted_profile_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.audit_events
  set
    actor_user_id = null,
    entity_id = null,
    before_data = null,
    after_data = jsonb_build_object('account_deleted', true)
  where entity_type = 'profile' and entity_id = old.id;
  return old;
end;
$$;

create trigger profiles_scrub_audit_before_delete
before delete on public.profiles
for each row execute function private.scrub_deleted_profile_audit();

revoke execute on function private.anonymize_deleted_account_member()
  from public, anon, authenticated;
revoke execute on function private.scrub_deleted_profile_audit()
  from public, anon, authenticated;

alter table public.night_members
  add constraint night_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
alter table public.drink_plan_items
  add constraint drink_plan_items_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.drink_logs
  add constraint drink_logs_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;
alter table public.water_logs
  add constraint water_logs_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;
alter table public.support_requests
  add constraint support_requests_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

commit;
