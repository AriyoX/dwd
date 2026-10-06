begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(26);
insert into auth.users(id,email,raw_user_meta_data) values
('b1000000-0000-4000-8000-000000000001','store-host@example.test','{"display_name":"Host","age_confirmed":true}'),
('b1000000-0000-4000-8000-000000000002','store-friend@example.test','{"display_name":"Friend","age_confirmed":true}'),
('b1000000-0000-4000-8000-000000000003','store-stranger@example.test','{"display_name":"Stranger","age_confirmed":true}');
insert into public.nights(id,host_user_id,creation_key,title,starts_at,initial_ends_at,ends_at,timezone) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'Shared',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour','Africa/Nairobi');
insert into public.night_members(id,night_id,user_id,display_name,member_type,role) values
('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Host','account','host'),
('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','Friend','account','member');
select extensions.ok((select relrowsecurity from pg_class where oid='private.user_blocks'::regclass),'blocks have RLS');
select extensions.ok(not has_table_privilege('authenticated','private.user_blocks','SELECT'),'clients cannot enumerate block relationships');
select extensions.ok(not has_function_privilege('anon','public.block_user(uuid)','EXECUTE'),'anonymous callers cannot block');
select extensions.ok(not has_function_privilege('anon','public.report_content(uuid,uuid,uuid,text,uuid)','EXECUTE'),'anonymous callers cannot report');
select extensions.ok(not has_function_privilege('authenticated','private.complete_account_deletion_v1(uuid,uuid,uuid)','EXECUTE'),'old erasure worker cannot be bypassed');
select extensions.throws_ok($$update public.profiles set display_name='i will kill you' where id='b1000000-0000-4000-8000-000000000002'$$,'22023','This content violates DWD community rules.','shared text threats are filtered by the server');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.is(public.get_preplot_preferences()->>'countryCode','UG','new accounts use Uganda without selecting a country');
select extensions.is(public.get_preplot_preferences()->>'countrySelected','true','legacy selection flag does not block automatic fallback');
select extensions.throws_ok($$select public.block_user('b1000000-0000-4000-8000-000000000001')$$,'42501','Participant not found.','self blocking is rejected');
select extensions.throws_ok($$select public.block_user('b1000000-0000-4000-8000-000000000003')$$,'42501','Participant not found.','unknown participant blocking is rejected');
select extensions.throws_ok($$select public.report_content('b2000000-0000-4000-8000-000000000099',null,null,'Abusive content',gen_random_uuid())$$,'42501','Night not found.','reports cannot reference inaccessible nights');
select extensions.lives_ok($$select public.report_content('b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',null,'Abusive content','b4000000-0000-4000-8000-000000000001')$$,'a scoped report reaches support');
select extensions.is(public.report_content('b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',null,'Abusive content','b4000000-0000-4000-8000-000000000001'),(select id from public.support_requests limit 1),'retry uses the same report');
reset role;
select extensions.ok((select message like '%b3000000-0000-4000-8000-000000000002%' from public.support_requests where user_id='b1000000-0000-4000-8000-000000000001'),'reports include validated participant context');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.block_user('b1000000-0000-4000-8000-000000000002');
select extensions.is(jsonb_array_length(public.get_blocked_users()),1,'blocker sees their own blocked people');
reset role;
select extensions.ok((select left_at is not null from public.night_members where id='b3000000-0000-4000-8000-000000000002'),'host blocking removes the other participant');
select extensions.throws_ok($$update public.night_members set left_at=null where id='b3000000-0000-4000-8000-000000000002'$$,'42501','This night is unavailable.','reactivation cannot bypass a block');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_blocked_users()),0,'a different account cannot see the blocker list');
reset role;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.unblock_user('b1000000-0000-4000-8000-000000000002');
select extensions.is(jsonb_array_length(public.get_blocked_users()),0,'unblock is available in account settings');
reset role;
update public.night_members set left_at=null where id='b3000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.block_user('b1000000-0000-4000-8000-000000000001');
reset role;
select extensions.ok((select left_at is not null from public.night_members where id='b3000000-0000-4000-8000-000000000002'),'non-host blocking leaves shared active nights');
select extensions.ok((select left_at is null from public.night_members where id='b3000000-0000-4000-8000-000000000001'),'blocking cannot remove someone else as host');
delete from private.user_blocks;
update public.nights set status='ended',ended_at=clock_timestamp() where id='b2000000-0000-4000-8000-000000000001';
insert into public.night_photos(id,night_id,uploaded_by_user_id,uploader_name,object_path,mime_type,byte_size) values
('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Host','b2000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001/photo.jpg','image/jpeg',1000);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_night_photos('b2000000-0000-4000-8000-000000000001')),0,'unreviewed images are hidden from other participants');
select extensions.ok(not has_table_privilege('authenticated','public.night_photos','UPDATE'),'uploaders cannot approve photos');
reset role;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_night_photos('b2000000-0000-4000-8000-000000000001')),1,'uploaders can see their pending image');
reset role;
update public.night_photos set moderation_status='approved';
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_night_photos('b2000000-0000-4000-8000-000000000001')),1,'approved images become visible to participants');
select public.block_user('b1000000-0000-4000-8000-000000000001');
select extensions.is(jsonb_array_length(public.get_night_photos('b2000000-0000-4000-8000-000000000001')),0,'blocking hides even approved images');
reset role;
select * from extensions.finish();
rollback;
