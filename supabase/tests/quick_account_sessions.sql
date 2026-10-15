begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(34);
insert into auth.users(id,email,raw_user_meta_data) values
 ('ad100000-0000-4000-8000-000000000001','quick-account-a@example.test','{"display_name":"Account A","age_confirmed":true}'),
 ('ad100000-0000-4000-8000-000000000002','quick-account-b@example.test','{"display_name":"Account B","age_confirmed":true}');
select extensions.ok((select relrowsecurity from pg_class where oid='public.quick_log_sessions'::regclass),'account sessions have RLS');
select extensions.ok((select relrowsecurity from pg_class where oid='public.quick_log_entries'::regclass),'account entries have RLS');
select extensions.ok(not has_function_privilege('anon','public.sync_quick_log(jsonb,jsonb)','EXECUTE'),'guest clients cannot save as an account');
select extensions.ok(not has_function_privilege('anon','public.get_quick_log_sessions(integer)','EXECUTE'),'guest clients cannot read account history');
select extensions.ok(not has_table_privilege('authenticated','public.quick_log_entries','INSERT'),'direct inserts cannot bypass ownership checks');
select extensions.ok(not has_table_privilege('authenticated','public.quick_log_sessions','UPDATE'),'direct updates cannot change account ownership');
select extensions.ok(not has_function_privilege('authenticated','private.account_quick_session(uuid)','EXECUTE'),'internal serialization cannot bypass owner reads');
create temporary table sync_state(key text primary key,value jsonb);
grant all on sync_state to authenticated;
insert into sync_state values('session','{"id":"ad200000-0000-4000-8000-000000000001","createdAt":"2026-10-13T23:55:00.000Z","updatedAt":"2026-10-14T00:05:00.000Z","finishedAt":null}');
insert into sync_state values('entries','[
 {"id":"ad300000-0000-4000-8000-000000000001","sessionId":"ad200000-0000-4000-8000-000000000001","kind":"drink","recordedAt":"2026-10-13T23:59:00.000Z","sequence":1,"revision":1,"updatedAt":"2026-10-13T23:59:00.000Z","removedAt":null,"destination":null},
 {"id":"ad300000-0000-4000-8000-000000000002","sessionId":"ad200000-0000-4000-8000-000000000001","kind":"shot","recordedAt":"2026-10-13T23:58:00.000Z","sequence":2,"revision":1,"updatedAt":"2026-10-13T23:58:00.000Z","removedAt":null,"destination":null},
 {"id":"ad300000-0000-4000-8000-000000000003","sessionId":"ad200000-0000-4000-8000-000000000001","kind":"chaser","recordedAt":"2026-10-14T00:05:00.000Z","sequence":3,"revision":1,"updatedAt":"2026-10-14T00:05:00.000Z","removedAt":null,"destination":null}]');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into sync_state values('receipt',public.sync_quick_log((select value from sync_state where key='session'),(select value from sync_state where key='entries')));
select extensions.is((select count(*) from public.quick_log_sessions),1::bigint,'sign-in saves a standalone session');
select extensions.is((select count(*) from public.nights),0::bigint,'sign-in never creates a planned night');
select extensions.is((select count(*) from public.quick_log_entries),3::bigint,'all valid guest kinds are saved');
select extensions.is((select value->>'claimedBy' from sync_state where key='receipt'),'ad100000-0000-4000-8000-000000000001','the server confirms the caller as owner');
select extensions.is(public.sync_quick_log((select value from sync_state where key='session'),(select value from sync_state where key='entries')),(select value from sync_state where key='receipt'),'response-loss retry returns the same session');
select extensions.is((select count(*) from public.quick_log_entries),3::bigint,'retries do not duplicate entries');
select extensions.is(public.get_quick_log_sessions(0)->0->'entries'->1->>'kind','shot','legacy shot identity is retained');
select extensions.is((public.get_quick_log_sessions(0)->0->'entries'->1->>'recordedAt')::timestamptz,'2026-10-13T23:58:00Z'::timestamptz,'recording timestamps survive backwards clock ordering');
select extensions.ok(not ((public.get_quick_log_sessions(0)->0->'entries'->0) ? 'volumeMl'),'account entries do not fabricate volume');
select extensions.throws_ok($$select public.sync_quick_log((select value from sync_state where key='session'),jsonb_build_array(((select value from sync_state where key='entries')->0)||'{"volumeMl":0}'::jsonb))$$,'22023','Invalid count-only entry.','measurements cannot be injected');
select extensions.throws_ok($$select public.sync_quick_log((select value from sync_state where key='session'),jsonb_build_array(((select value from sync_state where key='entries')->0)||'{"kind":"chaser"}'::jsonb))$$,'40001','This entry changed on another device. Your device copy is kept.','equal-revision conflicts never overwrite history');
select extensions.lives_ok($$select public.sync_quick_log((select value from sync_state where key='session'),jsonb_build_array(((select value from sync_state where key='entries')->0)||'{"revision":2,"removedAt":"2026-10-14T00:10:00Z","updatedAt":"2026-10-14T00:10:00Z"}'::jsonb))$$,'undo saves an entry tombstone');
select public.sync_quick_log((select value from sync_state where key='session'),(select value from sync_state where key='entries'));
select extensions.is((select revision from public.quick_log_entries where source_sequence=1),2,'stale retry cannot restore an undone entry');
select extensions.is((select count(*) from public.quick_log_entries),3::bigint,'partial batches never delete omitted entries');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*) from public.quick_log_entries),0::bigint,'RLS hides another account entries');
select extensions.is((select count(*) from public.quick_log_sessions),0::bigint,'RLS hides another account sessions');
select extensions.is(public.get_quick_log_sessions(0),'[]'::jsonb,'history RPC isolates accounts');
select extensions.throws_ok($$select public.sync_quick_log((select value from sync_state where key='session'),(select value from sync_state where key='entries'))$$,'42501','This Quick Log session belongs to another account.','another account cannot claim the same guest session');
insert into sync_state values('night',public.start_night_out_recoverable('ad400000-0000-4000-8000-000000000001','Other account night',clock_timestamp()+interval '2 hours','UTC','[]','[]'));
select extensions.throws_ok($$select public.import_quick_log('ad500000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001',((select value from sync_state where key='night')->>'nightId')::uuid,((select value from sync_state where key='night')#>>'{snapshot,currentMemberId}')::uuid,'[]')$$,'42501','This Quick Log session belongs to another account.','another account cannot transfer a claimed session');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
insert into sync_state values('own-night',public.start_night_out_recoverable('ad400000-0000-4000-8000-000000000002','Account quick destination',clock_timestamp()+interval '2 hours','UTC','[]','[]'));
select extensions.throws_ok($$select public.import_quick_log('ad500000-0000-4000-8000-000000000004','ad200000-0000-4000-8000-000000000001',((select value from sync_state where key='own-night')->>'nightId')::uuid,((select value from sync_state where key='own-night')#>>'{snapshot,currentMemberId}')::uuid,jsonb_build_array(((select value from sync_state where key='entries')->0) - 'updatedAt' - 'removedAt' - 'destination'))$$,'40001','This Quick Log entry changed on another device. Review your entries.','stale transfers cannot resurrect a remotely undone entry');
insert into sync_state values('import',public.import_quick_log('ad500000-0000-4000-8000-000000000002','ad200000-0000-4000-8000-000000000001',((select value from sync_state where key='own-night')->>'nightId')::uuid,((select value from sync_state where key='own-night')#>>'{snapshot,currentMemberId}')::uuid,
  (select jsonb_agg(e - 'updatedAt' - 'removedAt' - 'destination') from jsonb_array_elements((select value from sync_state where key='entries')) e where e->>'kind'<>'drink')));
select extensions.ok(public.get_quick_log_sessions(0)->0->'entries'->1->'destination' <> 'null'::jsonb,'history marks transferred sources so views can avoid double counting');
select extensions.is((select count(*) from public.drink_logs),0::bigint,'account transfer does not invent measured alcohol');
select extensions.is(public.get_night_snapshot(((select value from sync_state where key='own-night')->>'nightId')::uuid)#>'{members,0,quickLogs,0,ethanolGrams}','null'::jsonb,'night alcohol measurements remain unknown');
select extensions.is((select count(*) from public.quick_log_entries),3::bigint,'transfer preserves source identity in account history');
select extensions.throws_ok($$select public.sync_quick_log((select value from sync_state where key='session'),jsonb_build_array(((select value from sync_state where key='entries')->1)||'{"revision":2,"kind":"chaser"}'::jsonb))$$,'55000','This entry is now in a night. Make changes there.','transferred entries can only be corrected in their Night');
reset role;
insert into auth.users(id,email,raw_user_meta_data) values
 ('ad100000-0000-4000-8000-000000000003','quick-delete-account@example.test','{"display_name":"Delete standalone","age_confirmed":true}');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.sync_quick_log('{"id":"ad200000-0000-4000-8000-000000000003","createdAt":"2026-10-14T00:00:00Z","updatedAt":"2026-10-14T00:10:00Z","finishedAt":null}',
 '[{"id":"ad300000-0000-4000-8000-000000000004","sessionId":"ad200000-0000-4000-8000-000000000003","kind":"drink","recordedAt":"2026-10-14T00:10:00Z","sequence":1,"revision":1,"updatedAt":"2026-10-14T00:10:00Z","removedAt":null,"destination":null}]');
reset role;
delete from auth.users where id='ad100000-0000-4000-8000-000000000003';
select extensions.is((select count(*) from public.quick_log_sessions where account_id='ad100000-0000-4000-8000-000000000003'),0::bigint,'account erasure removes standalone sessions');
select extensions.is((select count(*) from public.quick_log_entries where account_id='ad100000-0000-4000-8000-000000000003'),0::bigint,'account erasure removes standalone entries');
select * from extensions.finish();
rollback;
