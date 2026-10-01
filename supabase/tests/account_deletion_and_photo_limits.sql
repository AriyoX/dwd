begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(40);

-- The isolated Postgres runner has no Storage service. This fixture represents
-- its service-owned object metadata; the browser suite exercises the actual API.
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner_id text, metadata jsonb
);
create table if not exists auth.sessions (id uuid primary key, user_id uuid references auth.users(id) on delete cascade);

insert into auth.users (id, email, raw_user_meta_data) values
  ('71000000-0000-4000-8000-000000000001', 'deletion-host@example.test', '{"display_name":"Delete Host","age_confirmed":true}'),
  ('71000000-0000-4000-8000-000000000002', 'deletion-friend@example.test', '{"display_name":"Keep Friend","age_confirmed":true}'),
  ('71000000-0000-4000-8000-000000000003', 'deletion-cancel@example.test', '{"display_name":"Cancel User","age_confirmed":true}');
insert into public.nights (id, host_user_id, creation_key, title, starts_at, initial_ends_at, ends_at, timezone)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', gen_random_uuid(),
  'Shared deletion night', clock_timestamp() - interval '2 hours', clock_timestamp() + interval '1 hour',
  clock_timestamp() + interval '1 hour', 'Africa/Nairobi');
insert into public.night_members (id, night_id, user_id, display_name, member_type, role, managed_by_user_id) values
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Delete Host', 'account', 'host', null),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'Keep Friend', 'account', 'member', null),
  ('73000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', null, 'Host Guest', 'guest', 'member', '71000000-0000-4000-8000-000000000001');
insert into public.night_end_time_changes (night_id, changed_by, previous_ends_at, new_ends_at)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', clock_timestamp() + interval '1 hour', clock_timestamp() + interval '2 hours');
insert into private.invite_revocations (user_id, request_key, night_id)
values ('71000000-0000-4000-8000-000000000001', repeat('f', 64), '72000000-0000-4000-8000-000000000001');
insert into public.night_alerts (night_id, night_member_id, type, severity, visibility, message, dedupe_key)
values ('72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000003',
  'group_check_in', 'caution', 'group', 'Check in on Host Guest.', 'deletion-guest-checkin');
insert into public.drink_logs (night_id, night_member_id, actor_user_id, label_snapshot, category_snapshot,
  volume_ml, abv_percent, consumed_at, idempotency_key)
values ('72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001', 'Beer', 'beer', 330, 5, clock_timestamp(), gen_random_uuid());

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.account_deletions'::regclass), 'deletion schedules have RLS');
select extensions.ok(not has_table_privilege('authenticated', 'public.account_deletions', 'UPDATE'), 'clients cannot change deletion deadlines');
select extensions.ok(not has_function_privilege('authenticated', 'public.claim_account_deletions(integer)', 'EXECUTE'), 'clients cannot claim deletion jobs');
select extensions.ok(not has_function_privilege('anon', 'public.schedule_account_deletion()', 'EXECUTE'), 'anonymous users cannot schedule deletion');
select extensions.ok(not has_function_privilege('authenticated', 'public.complete_account_deletion(uuid,uuid,uuid)', 'EXECUTE'), 'clients cannot delete other accounts');

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.ok(public.schedule_account_deletion()->>'deleteAfter' is not null, 'a user schedules their own deletion');
select extensions.ok((select delete_after = requested_at + interval '30 days' from public.account_deletions), 'the countdown is exactly 30 days');
select extensions.ok((public.schedule_account_deletion()->>'deleteAfter')::timestamptz = (select delete_after from public.account_deletions), 'retry does not restart the countdown');
reset role;
select extensions.is(jsonb_array_length(public.claim_account_deletions()), 0, 'worker leaves accounts younger than 30 days alone');
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*) from public.account_deletions), 0::bigint, 'other users cannot read deletion schedules');
reset role;
update auth.users set last_sign_in_at = clock_timestamp() where id = '71000000-0000-4000-8000-000000000003';
select extensions.ok(not exists (select 1 from public.account_deletions), 'a fresh login cancels the countdown');
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select public.schedule_account_deletion();
select public.cancel_account_deletion();
select extensions.is((select count(*) from public.account_deletions), 0::bigint, 'explicit cancellation clears the schedule');
reset role;

-- Validate both metadata and the upload gate independently of the uploader UI.
update public.nights set status = 'ended', ended_at = clock_timestamp() where id = '72000000-0000-4000-8000-000000000001';
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'night-memories', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/' || id::text || '.jpg',
  '71000000-0000-4000-8000-000000000002', '{"size":1200,"mimetype":"image/jpeg"}'::jsonb
from unnest(array['74000000-0000-4000-8000-000000000001'::uuid, '74000000-0000-4000-8000-000000000002'::uuid]) id;
update storage.objects set metadata = '{"size":5242880,"mimetype":"image/jpeg"}'
where name like '%74000000-0000-4000-8000-000000000002.jpg';
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok($$select public.register_night_photo('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 1200, 800, 600)$$, 'first photo registers');
select extensions.lives_ok($$select public.register_night_photo('74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000002.jpg', 'image/jpeg', 5242880, 800, 600)$$, 'a second photo exactly at 5 MB registers');
select extensions.lives_ok($$select public.register_night_photo('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 1200, 800, 600)$$, 'registration retry succeeds at the limit');
select extensions.ok(not private.can_upload_night_memory('72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000003.jpg'), 'direct uploads cannot bypass the two-photo quota');
select extensions.throws_ok($$select public.register_night_photo('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 5242881, 800, 600)$$, '22023', 'Photos must be 5 MB or smaller.', 'oversized registration is rejected');
select extensions.throws_ok($$select public.register_night_photo('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 1, 800, 600)$$, '22023', 'Photo details do not match the uploaded file.', 'lying about byte size cannot bypass validation');
reset role;
select extensions.throws_ok($$insert into public.night_photos (id, night_id, uploaded_by_user_id, uploader_name, object_path, mime_type, byte_size) values ('74000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'Keep Friend', 'third-photo.jpg', 'image/jpeg', 1200)$$, '54000', 'You can save up to 2 photos per night.', 'metadata inserts cannot bypass quota');
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.delete_night_photo('74000000-0000-4000-8000-000000000001');
reset role;
delete from storage.objects where name like '%74000000-0000-4000-8000-000000000001.jpg';
set local role authenticated;
select extensions.ok(private.can_upload_night_memory('72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000003.jpg'), 'deleting a photo frees an upload slot');
select extensions.ok(not private.can_upload_night_memory('72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000003.jpg'), 'users cannot upload into another account folder');
reset role;

-- Due host deletion preserves shared history and waits for real object removal.
update public.nights set status = 'active', ended_at = null where id = '72000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.schedule_account_deletion();
reset role;
update public.account_deletions set requested_at = now() - interval '31 days',
  delete_after = now() - interval '1 day';
insert into auth.sessions (id, user_id) values (gen_random_uuid(), '71000000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, owner_id, metadata) values ('night-memories',
  '72000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000004.jpg',
  '71000000-0000-4000-8000-000000000001', '{"size":1200,"mimetype":"image/jpeg"}');
create temporary table deletion_job as select public.claim_account_deletions()->0 value;
select extensions.ok((select value->>'userId' from deletion_job) = '71000000-0000-4000-8000-000000000001', 'the worker claims only the due account');
select extensions.is((select count(*) from auth.sessions where user_id = '71000000-0000-4000-8000-000000000001'), 0::bigint, 'claiming revokes refresh sessions');
select extensions.is(jsonb_array_length((select value->'objectPaths' from deletion_job)), 1, 'the worker receives its owned photo objects');
select extensions.throws_ok($$update auth.users set last_sign_in_at = clock_timestamp() where id = '71000000-0000-4000-8000-000000000001'$$, '55000', 'Account deletion is already in progress.', 'login cannot race destructive cleanup');
select extensions.throws_ok($$select public.cancel_account_deletion()$$, '55000', 'Account deletion is already in progress.', 'processing deletion cannot be cancelled');
select extensions.throws_ok($$select public.complete_account_deletion((value->>'userId')::uuid, (value->>'requestId')::uuid, (value->>'claimId')::uuid) from deletion_job$$, '55000', 'Remove account photos through Storage before deleting the account.', 'deletion waits for Storage cleanup');
select extensions.ok(not public.complete_account_deletion('71000000-0000-4000-8000-000000000001', null, null), 'missing claim tokens cannot complete deletion');
update public.account_deletions set claimed_at = clock_timestamp() - interval '16 minutes';
create temporary table retry_job as select public.claim_account_deletions()->0 value;
select extensions.ok((select value->>'claimId' from retry_job) <> (select value->>'claimId' from deletion_job), 'expired jobs can be reclaimed with a new token');
select extensions.ok(not public.complete_account_deletion((value->>'userId')::uuid, (value->>'requestId')::uuid, (value->>'claimId')::uuid), 'an old worker cannot complete a reclaimed job') from deletion_job;
delete from storage.objects where owner_id = '71000000-0000-4000-8000-000000000001';
select extensions.ok(public.complete_account_deletion((value->>'userId')::uuid, (value->>'requestId')::uuid, (value->>'claimId')::uuid), 'a due host account deletes automatically after cleanup') from retry_job;
select extensions.ok(not exists (select 1 from auth.users where id = '71000000-0000-4000-8000-000000000001') and not exists (select 1 from public.profiles where id = '71000000-0000-4000-8000-000000000001'), 'Auth and profile are removed');
select extensions.ok((select status = 'ended' and host_user_id is null from public.nights where id = '72000000-0000-4000-8000-000000000001'), 'the shared night remains closed without its deleted host');
select extensions.ok((select display_name = 'Deleted user' and user_id is null and left_at is not null from public.night_members where id = '73000000-0000-4000-8000-000000000001'), 'the deleted host membership is anonymized');
select extensions.ok((select display_name = 'Deleted guest' and managed_by_user_id is null from public.night_members where id = '73000000-0000-4000-8000-000000000003'), 'managed guest history survives anonymously');
select extensions.ok((select message not like '%Host Guest%' from public.night_alerts where dedupe_key = 'deletion-guest-checkin'), 'managed guest names are removed from retained alerts');
select extensions.is((select count(*) from private.invite_revocations where user_id = '71000000-0000-4000-8000-000000000001'), 0::bigint, 'private invitation retry records do not block deletion');
select extensions.is((select count(*) from public.drink_logs where night_id = '72000000-0000-4000-8000-000000000001' and actor_user_id is null), 1::bigint, 'historical drinks survive without account linkage');
select extensions.ok((select changed_by is null from public.night_end_time_changes where night_id = '72000000-0000-4000-8000-000000000001'), 'extension history survives without its actor');
select extensions.ok(exists (select 1 from auth.users where id = '71000000-0000-4000-8000-000000000002') and exists (select 1 from public.night_photos where uploaded_by_user_id = '71000000-0000-4000-8000-000000000002' and deleted_at is null), 'the friend account and photos remain intact');
select * from extensions.finish(true);
rollback;
