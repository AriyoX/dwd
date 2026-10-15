begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(46);
-- The isolated runner omits Storage; account erasure checks its object metadata.
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner_id text, metadata jsonb
);
set local role anon;
select extensions.is(public.get_invite_preview(repeat('f',64))->>'reason','invalid','anonymous invite previews work without private-schema privileges');
reset role;
select extensions.ok(not has_function_privilege('anon','public.import_quick_log(uuid,uuid,uuid,uuid,jsonb)','EXECUTE'),'signed-out clients cannot import');
select extensions.ok(not has_table_privilege('authenticated','public.quick_night_logs','INSERT'),'clients cannot bypass the import RPC');
select extensions.ok((select relrowsecurity from pg_class where oid='public.quick_night_logs'::regclass),'count-only history has RLS');
insert into auth.users(id,email,raw_user_meta_data) values
 ('fa100000-0000-4000-8000-000000000001','quick-host@example.test','{"display_name":"Host","age_confirmed":true}'),
 ('fa100000-0000-4000-8000-000000000002','quick-join@example.test','{"display_name":"Invitee","age_confirmed":true}'),
 ('fa100000-0000-4000-8000-000000000003','quick-outsider@example.test','{"display_name":"Outsider","age_confirmed":true}');
create temporary table quick_state(key text primary key,value jsonb);
grant all on quick_state to authenticated;
create function pg_temp.quick_id(text) returns uuid language sql as $$select (value#>>'{}')::uuid from quick_state where key=$1$$;
create function pg_temp.quick_entries() returns jsonb language sql as $$select jsonb_build_array(
 jsonb_build_object('id','fa300000-0000-4000-8000-000000000001','sessionId','fa400000-0000-4000-8000-000000000001','kind','drink','recordedAt',clock_timestamp()-interval '2 hours','sequence',1,'revision',2),
 jsonb_build_object('id','fa300000-0000-4000-8000-000000000002','sessionId','fa400000-0000-4000-8000-000000000001','kind','shot','recordedAt',clock_timestamp()-interval '90 minutes','sequence',2,'revision',1)
)$$;
insert into quick_state values('entries',pg_temp.quick_entries());
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into quick_state values('start',public.start_night_out_recoverable('fa500000-0000-4000-8000-000000000001','Quick destination',clock_timestamp()+interval '3 hours','UTC','[]','[]'));
insert into quick_state select 'night',value->'nightId' from quick_state where key='start';
insert into quick_state select 'host',value#>'{snapshot,currentMemberId}' from quick_state where key='start';
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000090','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),jsonb_set((select value from quick_state where key='entries'),'{0,sessionId}','null'))$$,'22023',null,'null source session IDs are rejected before import');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000091','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),jsonb_set((select value from quick_state where key='entries'),'{0,kind}','null'))$$,'22023',null,'null entry kinds are rejected as validation errors');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000092','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),jsonb_set((select value from quick_state where key='entries'),'{0,recordedAt}','null'))$$,'22023',null,'null recording times are rejected before import');
insert into quick_state values('receipt',public.import_quick_log('fa600000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='entries')));
select extensions.is((select count(*) from public.quick_night_logs),2::bigint,'both generic entries are imported');
select extensions.is((select count(*) from public.drink_logs),0::bigint,'no invented measured drink is created');
select extensions.is((public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,0,volumeMl}'),null::text,'unknown volume remains null');
select extensions.is((public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,0,abvPercent}'),null::text,'unknown strength remains null');
select extensions.is((public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,0,ethanolGrams}'),null::text,'unknown dose remains null');
select extensions.is((public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,0,sourceRevision}'),'2','source revision is preserved');
select extensions.is((public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,0,earlierLogging}'),'true','older recording times are marked as earlier logging');
select extensions.is((select recorded_at from public.quick_night_logs where source_entry_id='fa300000-0000-4000-8000-000000000001'),(select (value->0->>'recordedAt')::timestamptz from quick_state where key='entries'),'recording times are not retimed into night hours');
select extensions.is(public.import_quick_log('fa600000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='entries')),(select value from quick_state where key='receipt'),'response-loss retry returns the original receipt');
select extensions.is((select count(*) from public.quick_night_logs),2::bigint,'retry does not duplicate entries');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),jsonb_set((select value from quick_state where key='entries'),'{0,kind}','"shot"'))$$,'22023',null,'changed payload under the same operation is rejected');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000099','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='entries'))$$,'23505',null,'a new operation cannot reuse committed sources');
select extensions.is((select count(*) from public.night_alerts),0::bigint,'historical import emits no alcohol alerts');
select extensions.is((select count(*) from public.notification_events where night_id=pg_temp.quick_id('night')),0::bigint,'historical import emits no reminders');
select extensions.lives_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000003','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),jsonb_build_array(jsonb_build_object('id','fa300000-0000-4000-8000-000000000004','sessionId','fa400000-0000-4000-8000-000000000001','kind','shot','recordedAt',clock_timestamp()-interval '4 hours','sequence',3,'revision',1)))$$,'a new batch retains a recording time from a backwards-moving device clock');
select extensions.is(public.get_night_snapshot(pg_temp.quick_id('night'))#>>'{members,0,quickLogs,2,sequence}','3','destination history retains source sequence when clocks move backwards');
select public.create_night_invite(pg_temp.quick_id('night'),repeat('a',64),clock_timestamp()+interval '1 day',1) is not null;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
insert into quick_state values('join',public.redeem_night_invite(repeat('a',64)));
insert into quick_state select 'invitee',value->'memberId' from quick_state where key='join';
select extensions.is(public.redeem_night_invite(repeat('a',64))->>'memberId',pg_temp.quick_id('invitee')::text,'existing membership is reused on repeated valid invite');
select extensions.is(public.get_invite_preview(repeat('a',64))->>'valid','true','a full new-member quota does not hide an existing membership');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000011','fa400000-0000-4000-8000-000000000002',pg_temp.quick_id('night'),pg_temp.quick_id('host'),'[]')$$,'22023',null,'empty imports are rejected');
insert into quick_state values('inviteEntries',jsonb_build_array(jsonb_build_object('id','fa300000-0000-4000-8000-000000000003','sessionId','fa400000-0000-4000-8000-000000000002','kind','shot','recordedAt',clock_timestamp()-interval '1 hour','sequence',1,'revision',1)));
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000012','fa400000-0000-4000-8000-000000000002',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='inviteEntries'))$$,'42501',null,'invitee cannot import into host or another participant');
insert into quick_state values('inviteReceipt',public.import_quick_log('fa600000-0000-4000-8000-000000000002','fa400000-0000-4000-8000-000000000002',pg_temp.quick_id('night'),pg_temp.quick_id('invitee'),(select value from quick_state where key='inviteEntries')));
select extensions.is((select night_member_id from public.quick_night_logs where source_entry_id='fa300000-0000-4000-8000-000000000003'),pg_temp.quick_id('invitee'),'invited entries belong to the caller’s authorized membership without a plan');
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='entries'))$$,'42501',null,'another account cannot reconcile the initiating account’s operation');
select extensions.lives_ok($$select public.correct_quick_log((select id from public.quick_night_logs where source_entry_id='fa300000-0000-4000-8000-000000000003'),'drink')$$,'night correction path changes imported kind');
select extensions.is((select source_kind from public.quick_night_logs where source_entry_id='fa300000-0000-4000-8000-000000000003'),'shot','correction retains immutable provenance');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
select extensions.is((select count(*) from public.quick_night_logs),0::bigint,'RLS hides other nights from nonmembers');
select extensions.is(public.get_invite_preview(repeat('a',64))->>'reason','full','a full invitation stays unavailable to a new participant');
select extensions.throws_ok($$select public.correct_quick_log((select value#>>'{entries,0,destinationEntryId}' from quick_state where key='inviteReceipt')::uuid,'remove')$$,'42501',null,'another user cannot correct imported entries');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
insert into quick_state values('second',public.start_night_out_recoverable('fa500000-0000-4000-8000-000000000002','Second destination',clock_timestamp()+interval '3 hours','UTC','[]','[]'));
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000022','fa400000-0000-4000-8000-000000000001',(select (value->>'nightId')::uuid from quick_state where key='second'),(select (value#>>'{snapshot,currentMemberId}')::uuid from quick_state where key='second'),(select value from quick_state where key='entries'))$$,'23505',null,'source IDs cannot be imported into a different destination');
select public.end_night(pg_temp.quick_id('night')) is not null;
select extensions.throws_ok($$select public.import_quick_log('fa600000-0000-4000-8000-000000000023','fa400000-0000-4000-8000-000000000002',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='inviteEntries'))$$,'42501',null,'ended nights reject new imports');
select extensions.is(public.import_quick_log('fa600000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',pg_temp.quick_id('night'),pg_temp.quick_id('host'),(select value from quick_state where key='entries')),(select value from quick_state where key='receipt'),'committed receipt is recoverable after a night ends');
select extensions.is(public.get_finished_nights(0)->0->>'quickDrinkCount','1','finished history includes quick drinks distinctly');
select extensions.is(jsonb_array_length(public.get_finished_night_summary(pg_temp.quick_id('night'))#>'{members,0,quickLogs}'),3,'finished recap retains count-only entries');
select extensions.throws_ok($$select public.redeem_night_invite(repeat('a',64))$$,'22023',null,'ended invitations cannot join or cause an import');
select public.create_night_invite((select (value->>'nightId')::uuid from quick_state where key='second'),repeat('c',64),clock_timestamp()+interval '1 day',null) is not null;
reset role;
update public.night_invites set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where token_hash=repeat('c',64);
set local role authenticated;
select extensions.is(public.get_invite_preview(repeat('c',64))->>'reason','expired','expired invites are not revived for existing members');
reset role;
update public.night_invites set expires_at=clock_timestamp()+interval '1 day',revoked_at=clock_timestamp() where token_hash=repeat('c',64);
set local role authenticated;
select extensions.is(public.get_invite_preview(repeat('c',64))->>'reason','revoked','revoked invites are not revived for existing members');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
select public.schedule_account_deletion();
reset role;
update public.account_deletions set requested_at=now()-interval '31 days',delete_after=now()-interval '1 day'
where user_id='fa100000-0000-4000-8000-000000000002';
create temporary table quick_deletion_job as select public.claim_account_deletions()->0 value;
select extensions.ok(public.complete_account_deletion((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid),'account deletion completes with imported quick entries') from quick_deletion_job;
select extensions.is((select count(*) from public.quick_night_logs where night_member_id=pg_temp.quick_id('invitee')),0::bigint,'account deletion erases its imported quick entries');
select extensions.is((select count(*) from private.quick_log_import_operations where actor_user_id='fa100000-0000-4000-8000-000000000002'),0::bigint,'account deletion erases import receipts and source payloads');
select extensions.is((select count(*) from public.quick_night_logs where night_member_id=pg_temp.quick_id('host')),3::bigint,'account deletion preserves other participants quick entries');
select * from extensions.finish();
rollback;
