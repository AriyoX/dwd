begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(33);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists is_anonymous boolean default false;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('eb400000-0000-4000-8000-000000000001','ShebaTindy@gmail.com',now(),'{"display_name":"Organizer A","age_confirmed":true}'),
 ('eb400000-0000-4000-8000-000000000002','ahumuzaariyo@gmail.com',now(),'{"display_name":"Organizer B","age_confirmed":true}'),
 ('eb400000-0000-4000-8000-000000000003','other@example.test',now(),'{"display_name":"Other","age_confirmed":true,"admin":true}');
insert into public.page_admin_access(page_path,user_id,email)
select '/events/the-link-up/admin',id,lower(btrim(email)) from auth.users
where id in ('eb400000-0000-4000-8000-000000000001','eb400000-0000-4000-8000-000000000002');

select extensions.ok((select relrowsecurity from pg_class where oid='public.page_admin_access'::regclass),'grants have RLS');
select extensions.ok(not has_table_privilege('anon','public.page_admin_access','SELECT'),'guests cannot enumerate admin identities');
select extensions.ok(not has_table_privilege('authenticated','public.page_admin_access','SELECT'),'DWD accounts cannot enumerate grants');
select extensions.ok(not has_table_privilege('authenticated','public.page_admin_access','INSERT'),'DWD accounts cannot grant themselves access');
select extensions.ok(not has_function_privilege('anon','public.has_page_admin_access(uuid,text)','EXECUTE'),'guests cannot call access RPC');
select extensions.ok(not has_function_privilege('authenticated','public.has_page_admin_access(uuid,text)','EXECUTE'),'DWD accounts cannot call access RPC');
select extensions.ok(not has_function_privilege('authenticated','private.has_page_admin_access(uuid,text)','EXECUTE'),'private definer helper cannot be invoked by clients');
set local role service_role;
select extensions.ok(public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'Sheba verified email matches case-insensitively');
select extensions.ok(public.has_page_admin_access('eb400000-0000-4000-8000-000000000002','/events/the-link-up/admin'),'Ariyo has equivalent scoped access');
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000003','/events/the-link-up/admin'),'editable admin metadata grants nothing');
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/another-event/admin'),'Link Up permission grants no other page');
update public.page_admin_access set enabled=false where user_id='eb400000-0000-4000-8000-000000000001';
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'disabling row revokes access');
select extensions.ok(not public.link_up_provision_organizer('eb400000-0000-4000-8000-000000000001'),'old deployment cannot restore disabled access');
select extensions.ok(not (select enabled from public.page_admin_access where user_id='eb400000-0000-4000-8000-000000000001'),'repeated authorization never re-enables a grant');
select extensions.ok(public.has_page_admin_access('eb400000-0000-4000-8000-000000000002','/events/the-link-up/admin'),'revoking one user does not affect the other');
delete from public.page_admin_access where user_id='eb400000-0000-4000-8000-000000000001';
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'deleting grant revokes access');
select extensions.ok(not public.link_up_provision_organizer('eb400000-0000-4000-8000-000000000001'),'old deployment cannot restore deleted access');
select extensions.is((select count(*) from public.page_admin_access where user_id='eb400000-0000-4000-8000-000000000001'),0::bigint,'deleted grant remains absent after authorization');
insert into public.page_admin_access(page_path,user_id,email) values('/events/the-link-up/admin','eb400000-0000-4000-8000-000000000001','shebatindy@gmail.com');
select extensions.ok(public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'trusted explicit grant restores access');
reset role;
update auth.users set email_confirmed_at=null where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'current email must remain verified');
reset role;
update auth.users set email_confirmed_at=now(),email='changed@example.test' where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'verified email change cannot retain old grant');
reset role;
update auth.users set email='shebatindy@gmail.com',banned_until=now()+interval '1 day' where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'banned account denied');
reset role;
update auth.users set banned_until=null,deleted_at=now() where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'deleted account denied');
reset role;
update auth.users set deleted_at=null,is_anonymous=true where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin'),'anonymous auth identity denied');
reset role;
update auth.users set is_anonymous=false where id='eb400000-0000-4000-8000-000000000001';
set local role service_role;
insert into public.page_admin_access(page_path,user_id,email) values('/events/another-event/admin','eb400000-0000-4000-8000-000000000003','other@example.test');
select extensions.ok(public.has_page_admin_access('eb400000-0000-4000-8000-000000000003','/events/another-event/admin'),'another page can have a different admin');
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000003','/events/the-link-up/admin'),'second-page admin gets no Link Up permission');
select extensions.ok(not public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/another-event/admin'),'Link Up admin gets no second-page permission');
select extensions.throws_ok($$insert into public.page_admin_access(page_path,user_id,email) values('/events/the-link-up/admin','eb400000-0000-4000-8000-000000000001','shebatindy@gmail.com')$$,'23505',null,'duplicate grants rejected');
select extensions.throws_ok($$insert into public.page_admin_access(page_path,user_id,email) values('/invalid/admin','eb400000-0000-4000-8000-000000000001','UPPER@example.test')$$,'23514',null,'grant email must be normalized');
select extensions.throws_ok($$insert into public.page_admin_access(page_path,user_id,email,role) values('/invalid/admin','eb400000-0000-4000-8000-000000000001','shebatindy@gmail.com','owner')$$,'23514',null,'a grant cannot expand the allowed role');
set local request.jwt.claim.sub='eb400000-0000-4000-8000-000000000003';
select extensions.throws_ok($$select public.has_page_admin_access('eb400000-0000-4000-8000-000000000001','/events/the-link-up/admin')$$,'42501','Server authorization required.','helper rejects a mismatched authenticated subject');
set local request.jwt.claim.sub='';
reset role;
delete from auth.users where id='eb400000-0000-4000-8000-000000000003';
select extensions.is((select count(*) from public.page_admin_access where user_id='eb400000-0000-4000-8000-000000000003'),0::bigint,'deleting an auth identity removes its grants');
select extensions.ok(not has_table_privilege('authenticated','public.page_admin_access','UPDATE,DELETE'),'DWD accounts cannot change or remove grants');
select * from extensions.finish();
rollback;
