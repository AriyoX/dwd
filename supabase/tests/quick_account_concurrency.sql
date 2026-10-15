create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
insert into auth.users(id,email,raw_user_meta_data) values
 ('ac100000-0000-4000-8000-000000000001','quick-account-concurrent@example.test','{"display_name":"Concurrent account","age_confirmed":true}');
begin;
select extensions.plan(5);
select extensions.dblink_connect('sync_a','dbname=postgres user=supabase_admin');
select extensions.dblink_connect('sync_b','dbname=postgres user=supabase_admin');
select extensions.dblink_exec(connection,$$set "request.jwt.claim.sub"='ac100000-0000-4000-8000-000000000001'$$) from (values('sync_a'),('sync_b')) clients(connection);
select extensions.dblink_exec(connection,'set role authenticated') from (values('sync_a'),('sync_b')) clients(connection);
select extensions.dblink_send_query(connection,format($query$
 select public.sync_quick_log('{"id":"ac200000-0000-4000-8000-000000000001","createdAt":"2026-10-14T00:00:00Z","updatedAt":"2026-10-14T00:10:00Z","finishedAt":null}',
  '[{"id":"%s","sessionId":"ac200000-0000-4000-8000-000000000001","kind":"drink","recordedAt":"2026-10-14T00:10:00Z","sequence":1,"revision":1,"updatedAt":"2026-10-14T00:10:00Z","removedAt":null,"destination":null}]') from (select pg_sleep(0.1)) overlap;
 $query$,entry_id)) from (values('sync_a','ac300000-0000-4000-8000-000000000001'),('sync_b','ac300000-0000-4000-8000-000000000002')) clients(connection,entry_id);
create temporary table sync_receipts(receipt jsonb);
insert into sync_receipts select receipt from extensions.dblink_get_result('sync_a') as result(receipt jsonb);
insert into sync_receipts select receipt from extensions.dblink_get_result('sync_b') as result(receipt jsonb);
select extensions.is((select count(*) from sync_receipts),2::bigint,'two devices can append at the same sequence concurrently');
select extensions.is((select count(*) from public.quick_log_sessions),1::bigint,'concurrent saves claim one stable session');
select extensions.is((select count(*) from public.quick_log_entries),2::bigint,'both distinct entries survive concurrent saves');
select extensions.is((select count(distinct id) from public.quick_log_entries),2::bigint,'entries preserve distinct source identities');
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_quick_log_sessions(0)->0->'entries'),2,'account history includes both source positions');
reset role;
select extensions.dblink_disconnect('sync_a');
select extensions.dblink_disconnect('sync_b');
select * from extensions.finish();
rollback;
delete from auth.users where id='ac100000-0000-4000-8000-000000000001';
