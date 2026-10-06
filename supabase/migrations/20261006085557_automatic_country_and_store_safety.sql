begin;

-- Country selection is automatic; new accounts retain Uganda when location is declined.
alter table private.preplot_preferences alter column country_selected set default true;
update private.preplot_preferences set country_selected = true where not country_selected;
create or replace function public.get_preplot_preferences() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.preplot_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into p from private.preplot_preferences where user_id=auth.uid();
  return jsonb_build_object('enabled',coalesce(p.enabled,true),'sundayEnabled',coalesce(p.sunday_enabled,false),
    'countryCode',coalesce(p.country_code,'UG'),'calendarRegion',coalesce(p.calendar_region,'national'),'countrySelected',true);
end;
$$;
create or replace function private.preplot_context(p_user_id uuid)
returns table(country_code text, calendar_region text, timezone text)
language sql stable strict security invoker set search_path = '' as $$
  select coalesce(p.country_code, 'UG'), coalesce(p.calendar_region, 'national'), s.timezone
  from (select timezone from public.native_push_subscriptions s
    where user_id=p_user_id and disabled_at is null
      and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id)
    order by updated_at desc,id limit 1) s
  left join private.preplot_preferences p on p.user_id=p_user_id
  join private.preplot_markets m on m.country_code=coalesce(p.country_code,'UG')
    and m.enabled and s.timezone=any(m.timezones);
$$;

-- Account deletion erases personal activity rather than retaining pseudonymous drink histories.
alter function public.complete_account_deletion(uuid,uuid,uuid) rename to complete_account_deletion_v1;
alter function public.complete_account_deletion_v1(uuid,uuid,uuid) set schema private;
revoke all on function private.complete_account_deletion_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.complete_account_deletion(p_user_id uuid,p_request_id uuid,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.account_deletions%rowtype;
begin
  perform 1 from auth.users where id=p_user_id for update;
  if not found then return false; end if;
  select * into job from public.account_deletions where user_id=p_user_id for update;
  if not found or job.request_id is distinct from p_request_id or job.claim_id is distinct from p_claim_id
    or job.status<>'processing' or job.delete_after>clock_timestamp() then return false; end if;
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
  return private.complete_account_deletion_v1(p_user_id,p_request_id,p_claim_id);
end;
$$;
revoke all on function public.complete_account_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_account_deletion(uuid,uuid,uuid) to service_role;

create table private.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(blocker_user_id,blocked_user_id), check(blocker_user_id<>blocked_user_id)
);
create index user_blocks_blocked_idx on private.user_blocks(blocked_user_id);
alter table private.user_blocks enable row level security;
revoke all on private.user_blocks from public,anon,authenticated;

create function private.users_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.user_blocks where (blocker_user_id=a and blocked_user_id=b)
    or (blocker_user_id=b and blocked_user_id=a));
$$;
revoke all on function private.users_blocked(uuid,uuid) from public,anon,authenticated;

create function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); shared record;
begin
  if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=actor or not exists(select 1 from public.night_members a
    join public.night_members b on b.night_id=a.night_id where a.user_id=actor and b.user_id=p_user_id) then
    raise exception 'Participant not found.' using errcode='42501'; end if;
  -- Lock shared nights before membership changes, matching join/log lock order.
  for shared in select n.id,n.host_user_id from public.nights n where n.status='active'
    and exists(select 1 from public.night_members a where a.night_id=n.id and a.user_id=actor and a.left_at is null)
    and exists(select 1 from public.night_members b where b.night_id=n.id and b.user_id=p_user_id and b.left_at is null)
    order by n.id for update
  loop
    update public.night_members set left_at=greatest(joined_at,clock_timestamp())
    where night_id=shared.id and user_id=case when shared.host_user_id=actor then p_user_id else actor end and left_at is null;
  end loop;
  insert into private.user_blocks(blocker_user_id,blocked_user_id) values(actor,p_user_id) on conflict do nothing;
  delete from public.notification_events where (recipient_user_id=actor and sender_user_id=p_user_id)
    or (recipient_user_id=p_user_id and sender_user_id=actor);
end;
$$;
create function public.get_blocked_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId',b.blocked_user_id,'displayName',p.display_name))
    from private.user_blocks b join public.profiles p on p.id=b.blocked_user_id where b.blocker_user_id=auth.uid()),'[]'::jsonb);
end;
$$;
create function public.unblock_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  delete from private.user_blocks where blocker_user_id=auth.uid() and blocked_user_id=p_user_id;
end;
$$;

-- Both new joins and reactivation must respect blocks, including direct RPC callers.
create function private.prevent_blocked_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is not null and new.left_at is null and
    (tg_op='INSERT' or old.left_at is not null) and exists(select 1 from public.night_members other
      where other.night_id=new.night_id and other.left_at is null and other.user_id<>new.user_id
        and private.users_blocked(other.user_id,new.user_id)) then
    raise exception 'This night is unavailable.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger night_members_blocked_join before insert or update of left_at on public.night_members
for each row execute function private.prevent_blocked_membership();
revoke all on function private.prevent_blocked_membership() from public,anon,authenticated;

create function public.report_content(p_night_id uuid,p_member_id uuid,p_photo_id uuid,p_reason text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
  if actor is null or not exists(select 1 from public.night_members where night_id=p_night_id and user_id=actor) then
    raise exception 'Night not found.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 2000 or p_request_key is null then
    raise exception 'Describe the issue in 10 to 2000 characters.' using errcode='22023'; end if;
  if p_member_id is not null and not exists(select 1 from public.night_members where id=p_member_id and night_id=p_night_id) then
    raise exception 'Participant not found.' using errcode='42501'; end if;
  if p_photo_id is not null then
    select uploaded_by_user_id into target from public.night_photos where id=p_photo_id and night_id=p_night_id and deleted_at is null;
    if not found then raise exception 'Photo not found.' using errcode='42501'; end if;
  end if;
  return public.submit_support_request(p_request_key,'problem',
    '[Content report] Night: '||p_night_id::text||coalesce(' Member: '||p_member_id::text,'')||coalesce(' Photo: '||p_photo_id::text,'')||E'\n'||btrim(p_reason));
end;
$$;
revoke all on function public.block_user(uuid),public.get_blocked_users(),public.unblock_user(uuid),public.report_content(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.block_user(uuid),public.get_blocked_users(),public.unblock_user(uuid),public.report_content(uuid,uuid,uuid,text,uuid) to authenticated;

-- A narrow server-enforced filter catches explicit threats/exploitation in shared text.
-- Human report review remains necessary; this is not a claim of exhaustive moderation.
create function private.filter_shared_text() returns trigger
language plpgsql set search_path='' as $$
declare content text:=to_jsonb(new)->>tg_argv[0];
begin
  if lower(content) ~ '(kill yourself|i will kill you|child pornography)' then
    raise exception 'This content violates DWD community rules.' using errcode='22023'; end if;
  return new;
end;
$$;
create trigger profiles_content_filter before insert or update of display_name on public.profiles for each row execute function private.filter_shared_text('display_name');
create trigger nights_content_filter before insert or update of title on public.nights for each row execute function private.filter_shared_text('title');
create trigger members_content_filter before insert or update of display_name on public.night_members for each row execute function private.filter_shared_text('display_name');
create trigger plans_content_filter before insert or update of label on public.drink_plan_items for each row execute function private.filter_shared_text('label');
create trigger drinks_content_filter before insert on public.drink_logs for each row execute function private.filter_shared_text('label_snapshot');
create trigger bottles_content_filter before insert or update of label on public.shared_bottles for each row execute function private.filter_shared_text('label');
revoke all on function private.filter_shared_text() from public,anon,authenticated;

-- Shared images require operator review before anyone except the uploader can view them.
-- Client roles have no UPDATE grant and cannot approve their own uploads.
alter table public.night_photos add column moderation_status text not null default 'pending'
  check(moderation_status in ('pending','approved','rejected'));
create function private.can_view_photo(p_uploader uuid,p_status text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (p_uploader=auth.uid() or
    (p_status='approved' and not private.users_blocked(auth.uid(),p_uploader)));
$$;
revoke all on function private.can_view_photo(uuid,text) from public,anon;
grant execute on function private.can_view_photo(uuid,text) to authenticated;
drop policy night_photos_select_participants on public.night_photos;
create policy night_photos_select_participants on public.night_photos for select to authenticated
using(deleted_at is null and (select private.can_view_photo(uploaded_by_user_id,moderation_status))
  and exists(select 1 from public.night_members m where m.night_id=night_photos.night_id and m.user_id=(select auth.uid())));

create or replace function public.get_night_photos(p_night_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from public.night_members m join public.nights n on n.id=m.night_id
    where m.night_id=p_night_id and m.user_id=actor and n.status='ended') then
    raise exception 'Night not found.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'nightId',p.night_id,'uploadedByUserId',p.uploaded_by_user_id,'uploaderName',p.uploader_name,
    'objectPath',p.object_path,'mimeType',p.mime_type,'byteSize',p.byte_size,'width',p.width,'height',p.height,
    'createdAt',p.created_at,'moderationStatus',p.moderation_status) order by p.created_at desc,p.id)
    from public.night_photos p where p.night_id=p_night_id and p.deleted_at is null
      and private.can_view_photo(p.uploaded_by_user_id,p.moderation_status)),'[]'::jsonb);
end;
$$;

commit;
