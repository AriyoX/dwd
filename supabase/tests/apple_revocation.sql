begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(23);
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb
);
insert into auth.users(id,email,raw_user_meta_data) values
('c1000000-0000-4000-8000-000000000001','apple-owner@example.test','{"display_name":"Owner","age_confirmed":true}'),
('c1000000-0000-4000-8000-000000000002','email-owner@example.test','{"display_name":"Email","age_confirmed":true}');
insert into auth.identities(user_id,provider,provider_id,identity_data)
values('c1000000-0000-4000-8000-000000000001','apple','apple-subject','{"sub":"apple-subject"}');
select extensions.ok((select relrowsecurity from pg_class where oid='private.apple_revocation_tokens'::regclass),'provider credentials have RLS');
select extensions.ok(not has_table_privilege('authenticated','private.apple_revocation_tokens','SELECT'),'clients cannot read encrypted credentials');
select extensions.ok(not has_function_privilege('anon','public.get_apple_deletion_ready()','EXECUTE'),'anonymous accounts cannot inspect readiness');
select extensions.ok(not has_function_privilege('authenticated','public.store_apple_revocation_token(uuid,text,text,text)','EXECUTE'),'clients cannot write provider tokens');
select extensions.ok(has_function_privilege('service_role','public.get_apple_deletion_token(uuid,uuid,uuid)','EXECUTE'),'worker can fetch a claimed deletion token');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.ok(public.get_apple_deletion_ready(),'email-only deletion does not require Apple');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select extensions.ok(not public.get_apple_deletion_ready(),'Apple account without captured grant needs reconnection');
select extensions.throws_ok($$select public.schedule_account_deletion()$$,'55000','Reconnect Apple in DWD before scheduling deletion.','missing token is caught before irreversible processing');
reset role;
select extensions.throws_ok($$select public.store_apple_revocation_token('c1000000-0000-4000-8000-000000000001','other-subject','com.dwd.app',repeat('x',100))$$,'42501','Apple identity not found.','token subject must match the trusted Auth identity');
select extensions.throws_ok($$select public.store_apple_revocation_token('c1000000-0000-4000-8000-000000000002','apple-subject','com.dwd.app',repeat('x',100))$$,'42501','Apple identity not found.','a token cannot be assigned to an email-only account');
select extensions.lives_ok($$select public.store_apple_revocation_token('c1000000-0000-4000-8000-000000000001','apple-subject','com.dwd.app',repeat('x',100))$$,'service can store a verified encrypted credential');
set local role authenticated;
select extensions.ok(public.get_apple_deletion_ready(),'captured account is ready to schedule deletion');
select extensions.ok(public.schedule_account_deletion() is not null,'Apple deletion schedules normally after capture');
reset role;
insert into public.nights(id,host_user_id,creation_key,title,starts_at,initial_ends_at,ends_at,timezone) values
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'Private owner title',now()-interval '1 hour',now()+interval '1 hour',now()+interval '1 hour','Africa/Kampala');
insert into public.night_members(id,night_id,user_id,display_name,member_type,role) values
('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Owner','account','host');
insert into public.shared_bottles(id,night_id,creator_member_id,label,category,volume_ml,abv_percent,pour_ml,access) values
('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Private owner bottle','spirit',750,40,30,'everyone');
update public.account_deletions set requested_at=now()-interval '31 days',delete_after=now()-interval '1 day';
create temporary table apple_job as select public.claim_account_deletions()->0 value;
select extensions.is((select public.get_apple_deletion_token((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid)->>'clientId' from apple_job),'com.dwd.app','current worker receives the app identity');
select extensions.throws_ok($$select public.get_apple_deletion_token('c1000000-0000-4000-8000-000000000001',null,null)$$,'42501','Deletion claim unavailable.','unknown claim cannot fetch a credential');
select extensions.throws_ok($$select public.complete_account_deletion((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid) from apple_job$$,'55000','Revoke Apple authorization before deleting the account.','Auth deletion cannot bypass provider revocation');
select extensions.ok(not public.mark_apple_authorization_revoked('c1000000-0000-4000-8000-000000000001',null,null),'stale acknowledgement cannot mark a grant revoked');
select extensions.ok(public.mark_apple_authorization_revoked((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid),'current worker can acknowledge successful revocation') from apple_job;
select extensions.ok(public.get_apple_deletion_token((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid) is null,'retry does not repeat an acknowledged provider revocation') from apple_job;
select extensions.ok(public.complete_account_deletion((value->>'userId')::uuid,(value->>'requestId')::uuid,(value->>'claimId')::uuid),'account deletes after provider acknowledgement') from apple_job;
select extensions.is((select count(*) from private.apple_revocation_tokens),0::bigint,'encrypted credentials cascade with Auth deletion');
select extensions.is((select title from public.nights where id='c2000000-0000-4000-8000-000000000001'),'Shared night','authored night title is removed from shared history');
select extensions.is((select label from public.shared_bottles where id='c4000000-0000-4000-8000-000000000001'),'Shared bottle','authored bottle label is removed from shared history');
select * from extensions.finish(true);
rollback;
