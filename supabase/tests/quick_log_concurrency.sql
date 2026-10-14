-- Committed fixtures let two independent connections contend on the actual server locks.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fc100000-0000-4000-8000-000000000001','quick-concurrent@example.test','{"display_name":"Concurrent host","age_confirmed":true}');
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',false);
select public.start_night_out_recoverable('fc200000-0000-4000-8000-000000000001','Concurrent imports',clock_timestamp()+interval '2 hours','UTC','[]','[]') is not null;
begin;
select extensions.plan(4);
select extensions.dblink_connect('quick_a','dbname=postgres user=supabase_admin');
select extensions.dblink_connect('quick_b','dbname=postgres user=supabase_admin');
select extensions.dblink_exec('quick_a',$$set "request.jwt.claim.sub"='fc100000-0000-4000-8000-000000000001'$$);
select extensions.dblink_exec('quick_b',$$set "request.jwt.claim.sub"='fc100000-0000-4000-8000-000000000001'$$);
select extensions.dblink_exec('quick_a','set role authenticated');
select extensions.dblink_exec('quick_b','set role authenticated');
select extensions.dblink_send_query(connection,$query$
 select public.import_quick_log('fc300000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001',
 (select id from public.nights where creation_key='fc200000-0000-4000-8000-000000000001'),
 (select m.id from public.night_members m join public.nights n on n.id=m.night_id where n.creation_key='fc200000-0000-4000-8000-000000000001' and m.user_id='fc100000-0000-4000-8000-000000000001'),
 '[{"id":"fc500000-0000-4000-8000-000000000001","sessionId":"fc400000-0000-4000-8000-000000000001","kind":"drink","recordedAt":"2026-10-12T18:00:00Z","sequence":1,"revision":1}]'::jsonb
 ) from (select pg_sleep(0.2)) overlap;
$query$) from (values('quick_a'),('quick_b')) clients(connection);
create temporary table quick_concurrent_receipts(receipt jsonb);
insert into quick_concurrent_receipts select receipt from extensions.dblink_get_result('quick_a') as result(receipt jsonb);
insert into quick_concurrent_receipts select receipt from extensions.dblink_get_result('quick_b') as result(receipt jsonb);
select extensions.is((select count(*) from quick_concurrent_receipts),2::bigint,'both concurrent requests succeed');
select extensions.is((select count(distinct receipt) from quick_concurrent_receipts),1::bigint,'concurrent retries return the same server receipt');
select extensions.is((select count(*) from public.quick_night_logs where source_session_id='fc400000-0000-4000-8000-000000000001'),1::bigint,'concurrent retries create one entry');
select extensions.is((select count(*) from private.quick_log_import_operations where id='fc300000-0000-4000-8000-000000000001'),1::bigint,'concurrent retries commit one operation');
select extensions.dblink_disconnect('quick_a');
select extensions.dblink_disconnect('quick_b');
select * from extensions.finish();
rollback;
delete from public.nights where creation_key='fc200000-0000-4000-8000-000000000001';
delete from auth.users where id='fc100000-0000-4000-8000-000000000001';
