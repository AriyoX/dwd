begin;
create table private.apple_revocation_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subject text not null,
  client_id text not null,
  encrypted_token text not null check(char_length(encrypted_token) between 80 and 16384),
  captured_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
alter table private.apple_revocation_tokens enable row level security;
revoke all on private.apple_revocation_tokens from public,anon,authenticated,service_role;

create function public.store_apple_revocation_token(p_user_id uuid,p_subject text,p_client_id text,p_encrypted_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from auth.users where id=p_user_id for update;
  if not found or not exists(select 1 from auth.identities where user_id=p_user_id and provider='apple'
    and (identity_data->>'sub'=p_subject or provider_id=p_subject)) then
    raise exception 'Apple identity not found.' using errcode='42501';
  end if;
  if p_client_id is null or char_length(p_client_id) not between 3 and 255 or
    exists(select 1 from public.account_deletions where user_id=p_user_id and status='processing') then
    raise exception 'Account unavailable.' using errcode='55000';
  end if;
  insert into private.apple_revocation_tokens(user_id,subject,client_id,encrypted_token)
  values(p_user_id,p_subject,p_client_id,p_encrypted_token)
  on conflict(user_id) do update set subject=excluded.subject,client_id=excluded.client_id,
    encrypted_token=excluded.encrypted_token,captured_at=clock_timestamp(),revoked_at=null;
end;
$$;

create function public.get_apple_deletion_ready() returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  return not exists(select 1 from auth.identities where user_id=auth.uid() and provider='apple')
    or exists(select 1 from private.apple_revocation_tokens where user_id=auth.uid());
end;
$$;
revoke all on function public.get_apple_deletion_ready() from public,anon;
grant execute on function public.get_apple_deletion_ready() to authenticated;

-- All clients get a clear reauthentication requirement if an old Apple grant has no revocable token.
alter function public.schedule_account_deletion() rename to schedule_account_deletion_v1;
alter function public.schedule_account_deletion_v1() set schema private;
revoke all on function private.schedule_account_deletion_v1() from public,anon,authenticated,service_role;
create function public.schedule_account_deletion() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  if not public.get_apple_deletion_ready() then
    raise exception 'Reconnect Apple in DWD before scheduling deletion.' using errcode='55000';
  end if;
  return private.schedule_account_deletion_v1();
end;
$$;
revoke all on function public.schedule_account_deletion() from public,anon;
grant execute on function public.schedule_account_deletion() to authenticated;

create function public.get_apple_deletion_token(p_user_id uuid,p_request_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token private.apple_revocation_tokens%rowtype;
begin
  if not exists(select 1 from public.account_deletions where user_id=p_user_id and request_id=p_request_id
    and claim_id=p_claim_id and status='processing' and delete_after<=clock_timestamp()) then
    raise exception 'Deletion claim unavailable.' using errcode='42501';
  end if;
  select * into token from private.apple_revocation_tokens where user_id=p_user_id;
  if not found then
    if exists(select 1 from auth.identities where user_id=p_user_id and provider='apple') then
      raise exception 'Apple authorization needs reconnection.' using errcode='55000';
    end if;
    return null;
  end if;
  if token.revoked_at is not null then return null; end if;
  return jsonb_build_object('encryptedToken',token.encrypted_token,'clientId',token.client_id);
end;
$$;

create function public.mark_apple_authorization_revoked(p_user_id uuid,p_request_id uuid,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from auth.users where id=p_user_id for update;
  perform 1 from public.account_deletions where user_id=p_user_id and request_id=p_request_id
    and claim_id=p_claim_id and status='processing' and delete_after<=clock_timestamp() for update;
  if not found then return false; end if;
  update private.apple_revocation_tokens set revoked_at=clock_timestamp() where user_id=p_user_id;
  return found;
end;
$$;
revoke all on function public.store_apple_revocation_token(uuid,text,text,text),
 public.get_apple_deletion_token(uuid,uuid,uuid),public.mark_apple_authorization_revoked(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.store_apple_revocation_token(uuid,text,text,text),
 public.get_apple_deletion_token(uuid,uuid,uuid),public.mark_apple_authorization_revoked(uuid,uuid,uuid)
 to service_role;

create or replace function public.complete_account_deletion(p_user_id uuid,p_request_id uuid,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.account_deletions%rowtype;
begin
  perform 1 from auth.users where id=p_user_id for update;
  if not found then return false; end if;
  select * into job from public.account_deletions where user_id=p_user_id for update;
  if not found or job.request_id is distinct from p_request_id or job.claim_id is distinct from p_claim_id
    or job.status<>'processing' or job.delete_after>clock_timestamp() then return false; end if;
  if exists(select 1 from auth.identities where user_id=p_user_id and provider='apple')
    and not exists(select 1 from private.apple_revocation_tokens where user_id=p_user_id and revoked_at is not null) then
    raise exception 'Revoke Apple authorization before deleting the account.' using errcode='55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-memory/'||p_user_id::text,0));
  if to_regclass('storage.objects') is not null and exists(select 1 from storage.objects
    where bucket_id='night-memories' and (owner_id=p_user_id::text or split_part(name,'/',2)=p_user_id::text)) then
    raise exception 'Remove account photos through Storage before deleting the account.' using errcode='55000';
  end if;
  update public.audit_events set actor_user_id=null,entity_id=null,before_data=null,after_data='{"account_deleted":true}'::jsonb
  where actor_user_id=p_user_id or entity_id in (
    select id from public.drink_logs where actor_user_id=p_user_id or night_member_id in(select id from public.night_members where user_id=p_user_id)
    union select id from public.drink_plan_items where created_by=p_user_id
  );
  delete from public.drink_logs where actor_user_id=p_user_id or night_member_id in(select id from public.night_members where user_id=p_user_id or managed_by_user_id=p_user_id);
  delete from public.water_logs where actor_user_id=p_user_id or night_member_id in(select id from public.night_members where user_id=p_user_id or managed_by_user_id=p_user_id);
  delete from public.drink_plan_items where created_by=p_user_id or night_member_id in(select id from public.night_members where user_id=p_user_id or managed_by_user_id=p_user_id);
  -- End first while the host still owns the membership: name capture validates that relationship.
  update public.nights set status='ended',ended_at=coalesce(ended_at,greatest(starts_at,clock_timestamp()))
    where host_user_id=p_user_id and status='active';
  -- Remove shared free-text authored by this account while preserving other participants' own records.
  update public.nights set title='Shared night' where host_user_id=p_user_id;
  update public.shared_bottles set label='Shared bottle' where creator_member_id in(
    select id from public.night_members where user_id=p_user_id or managed_by_user_id=p_user_id);
  return private.complete_account_deletion_v1(p_user_id,p_request_id,p_claim_id);
end;
$$;

-- Cover foreign-key lookups used by deletion and notification cleanup.
create index checkin_requests_target_fk_idx on public.checkin_requests(target_member_id);
create index drink_logs_member_night_fk_idx on public.drink_logs(night_id,night_member_id);
create index drink_logs_plan_member_fk_idx on public.drink_logs(night_member_id,plan_item_id);
create index night_alerts_member_night_fk_idx on public.night_alerts(night_id,night_member_id);
create index night_invites_creator_fk_idx on public.night_invites(created_by);
create index notification_deliveries_subscription_fk_idx on public.notification_deliveries(subscription_id);
create index notification_events_sender_fk_idx on public.notification_events(sender_user_id);
create index notification_events_target_fk_idx on public.notification_events(target_member_id);
create index notification_schedules_night_fk_idx on public.notification_schedules(night_id);
create index water_logs_member_night_fk_idx on public.water_logs(night_id,night_member_id);
commit;
