begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(32);
-- The isolated Postgres fixture omits columns normally owned by GoTrue.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
create function pg_temp.files(p_count integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('clientId',gen_random_uuid(),'fingerprint',repeat('a',64),'type','image/jpeg','size',1000)) from generate_series(1,p_count)
$$;
select extensions.ok(not has_table_privilege('anon','public.event_photos','SELECT'),'anonymous clients cannot read private photo metadata');
select extensions.ok(not has_table_privilege('authenticated','public.photo_guest_sessions','SELECT'),'DWD accounts cannot read anonymous photo sessions');
select extensions.ok(not has_function_privilege('anon','public.link_up_reserve(uuid,uuid,jsonb)','EXECUTE'),'anonymous clients cannot reserve capacity directly');
select extensions.ok(not has_function_privilege('authenticated','public.link_up_provision_organizer(uuid)','EXECUTE'),'DWD accounts cannot provision organizer roles directly');
set local role service_role;
select extensions.is((select count(*) from public.link_up_reserve('ea100000-0000-4000-8000-000000000001','ea200000-0000-4000-8000-000000000001',pg_temp.files(10))),10::bigint,'reserve ten photos');
select extensions.is((select reserved_bytes from public.photo_events),43253760::bigint,'reserves full photo and thumbnail budget');
select extensions.throws_ok($$select * from public.link_up_reserve('ea100000-0000-4000-8000-000000000001',gen_random_uuid(),pg_temp.files(11))$$,'P0001','invalid_batch','reject more than ten in one batch');
select count(*) from public.link_up_reserve('ea100000-0000-4000-8000-000000000001',gen_random_uuid(),pg_temp.files(10));
select extensions.throws_ok($$select * from public.link_up_reserve('ea100000-0000-4000-8000-000000000001',gen_random_uuid(),pg_temp.files(6))$$,'P0001','session_quota','pending reservations consume the browser quota');
select count(*) from public.link_up_reserve('ea100000-0000-4000-8000-000000000001',gen_random_uuid(),pg_temp.files(5));
select extensions.throws_ok($$select * from public.link_up_reserve('ea100000-0000-4000-8000-000000000001',gen_random_uuid(),pg_temp.files(1))$$,'P0001','session_quota','25 photos is the initial session limit');
update public.photo_events set storage_budget_bytes=reserved_bytes;
select extensions.throws_ok($$select * from public.link_up_reserve('ea100000-0000-4000-8000-000000000002',gen_random_uuid(),pg_temp.files(1))$$,'P0001','storage_quota','event budget includes other sessions pending capacity');
update public.photo_events set storage_budget_bytes=5368709120;
create temporary table chosen as select * from public.photo_upload_reservations limit 1;
select extensions.is((public.link_up_claim('ea100000-0000-4000-8000-000000000001',(select id from chosen),'ea300000-0000-4000-8000-000000000001')).status,'verifying','claim verification');
select extensions.throws_ok($$select public.link_up_claim('ea100000-0000-4000-8000-000000000001',(select id from chosen),gen_random_uuid())$$,'P0001','verification_busy','duplicate completion cannot concurrently verify');
select extensions.is(public.link_up_finish((select id from chosen),'ea300000-0000-4000-8000-000000000001',900,100,100,100),(select id from chosen),'publish automatically');
select extensions.is(public.link_up_finish((select id from chosen),gen_random_uuid(),900,100,100,100),(select id from chosen),'completion is idempotent');
select extensions.is((select count(*) from public.event_photos where status='published'),1::bigint,'one published photo after repeated completion');
select extensions.is((select used_bytes from public.photo_events),1000::bigint,'account for final photo and thumbnail once');
select extensions.is((select published_count from public.photo_guest_sessions where id='ea100000-0000-4000-8000-000000000001'),1,'increment lifetime published quota once');
select public.link_up_moderate((select id from chosen),'hide');
select extensions.is((select count(*) from public.event_photos where status='published'),0::bigint,'hidden photo excluded from public gallery predicate');
select public.link_up_moderate((select id from chosen),'delete');
select extensions.is((select status from public.event_photos),'deleting','deletion hides before removing objects');
delete from public.photo_object_cleanup where object_key in (select final_key from chosen union all select thumbnail_key from chosen);
select public.link_up_finalize_deletions();
select extensions.is((select used_bytes from public.photo_events),0::bigint,'free storage only after R2 deletion acknowledgement');
update public.photo_upload_reservations set expires_at=now()-interval '1 minute' where status='pending';
select extensions.is(public.link_up_expire_uploads(),24,'release abandoned reservations');
select extensions.is((select reserved_bytes from public.photo_events),0::bigint,'expired reservations release every reserved byte');
create temporary table cancelled as select * from public.link_up_reserve('ea100000-0000-4000-8000-000000000002',gen_random_uuid(),pg_temp.files(1));
select extensions.is(public.link_up_cancel('ea100000-0000-4000-8000-000000000001',array[(select id from cancelled)]),0,'other sessions cannot cancel a reservation');
select extensions.is(public.link_up_cancel('ea100000-0000-4000-8000-000000000002',array[(select id from cancelled)]),1,'clearing a batch releases its reservations');
select extensions.is(public.link_up_cancel('ea100000-0000-4000-8000-000000000002',array[(select id from cancelled)]),0,'cancellation is idempotent');
select extensions.is((select reserved_bytes from public.photo_events),0::bigint,'cancelled batches free all logical capacity');
select extensions.ok(public.link_up_rate_limit('ea100000-0000-4000-8000-000000000001','report',1,600),'first report allowed');
select extensions.ok(not public.link_up_rate_limit('ea100000-0000-4000-8000-000000000001','report',1,600),'report rate limit enforced');
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('ea400000-0000-4000-8000-000000000001','ShebaTindy@gmail.com',now(),'{"display_name":"Organizer A","age_confirmed":true}'),
 ('ea400000-0000-4000-8000-000000000002','ahumuzaariyo@gmail.com',now(),'{"display_name":"Organizer B","age_confirmed":true}'),
 ('ea400000-0000-4000-8000-000000000003','other@example.test',now(),'{"display_name":"Other account","age_confirmed":true}');
insert into public.page_admin_access(page_path,user_id,email)
select '/events/the-link-up/admin',id,lower(btrim(email)) from auth.users
where id in ('ea400000-0000-4000-8000-000000000001','ea400000-0000-4000-8000-000000000002');
set local role service_role;
select extensions.ok(public.link_up_provision_organizer('ea400000-0000-4000-8000-000000000001'),'verified Sheba organizer has page access case-insensitively');
select extensions.ok(public.link_up_provision_organizer('ea400000-0000-4000-8000-000000000002'),'verified Ariyo organizer has equivalent access');
select extensions.ok(not public.link_up_provision_organizer('ea400000-0000-4000-8000-000000000003'),'unauthorized account is rejected');
reset role;
update auth.users set email='changed@example.test' where id='ea400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.link_up_provision_organizer('ea400000-0000-4000-8000-000000000001'),'email change revokes previously provisioned access');
reset role;
select * from extensions.finish();
rollback;
