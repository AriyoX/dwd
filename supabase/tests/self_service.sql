begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(31);

insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at) values
 ('00000000-0000-4000-8000-000000000001', 'host@dwd.test', '{"display_name":"Host","age_confirmed":true}', now(), now()),
 ('00000000-0000-4000-8000-000000000002', 'member@dwd.test', '{"display_name":"Member","age_confirmed":true}', now(), now()),
 ('00000000-0000-4000-8000-000000000003', 'outsider@dwd.test', '{"display_name":"Outsider","age_confirmed":true}', now(), now());
create temporary table state(key text primary key, value jsonb);
grant all on state to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into state values ('night', public.start_night_out('10000000-0000-4000-8000-000000000001','Water night',clock_timestamp()+interval '2 hours','Africa/Nairobi','[]','[{"displayName":"Robin","planItems":[]}]'));
insert into state select 'host', to_jsonb(id) from public.night_members where role='host';
insert into state select 'guest', to_jsonb(id) from public.night_members where member_type='guest';
select extensions.is((select count(*) from public.drink_plan_items),0::bigint,'water-only host and guest require no alcohol plan');
select extensions.is(public.log_water((select (value#>>'{}')::uuid from state where key='host'),clock_timestamp(),gen_random_uuid())->>'status','created','water-only host logs water');
select extensions.is(public.log_water((select (value#>>'{}')::uuid from state where key='guest'),clock_timestamp(),gen_random_uuid())->>'status','created','host logs water for water-only guest');
select extensions.is(public.log_drink((select (value#>>'{}')::uuid from state where key='host'),null,'{"label":"Beer","category":"beer","volume_ml":330,"abv_percent":5}',clock_timestamp(),gen_random_uuid(),true,true)->>'code','plan_required','acknowledgements cannot bypass alcohol plan requirement');
select extensions.is(public.start_night_out('10000000-0000-4000-8000-000000000001','Water night',clock_timestamp()+interval '2 hours','Africa/Nairobi','[]','[]')->>'duplicate','true','retrying saved setup recovers the same night');
select public.replace_member_plan((select (value#>>'{}')::uuid from state where key='host'),'[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":1,"isQuickLog":true}]') is not null;
insert into state select 'plan',to_jsonb(id) from public.drink_plan_items where archived_at is null;
insert into state values ('consumed',to_jsonb(clock_timestamp()));
select public.replace_member_plan((select (value#>>'{}')::uuid from state where key='host'),'[]') is not null;
select extensions.is(public.log_drink((select (value#>>'{}')::uuid from state where key='host'),(select (value#>>'{}')::uuid from state where key='plan'),null,(select (value#>>'{}')::timestamptz from state where key='consumed'),'20000000-0000-4000-8000-000000000001',false,false)->>'status','confirmation_required','queued alcohol still requires acknowledgement when the current plan is empty');
select extensions.is(public.log_drink((select (value#>>'{}')::uuid from state where key='host'),(select (value#>>'{}')::uuid from state where key='plan'),null,(select (value#>>'{}')::timestamptz from state where key='consumed'),'20000000-0000-4000-8000-000000000001',true,false)->>'status','created','alcohol queued before switching to water still syncs');
select extensions.is(public.log_drink((select (value#>>'{}')::uuid from state where key='host'),(select (value#>>'{}')::uuid from state where key='plan'),null,(select (value#>>'{}')::timestamptz from state where key='consumed'),'20000000-0000-4000-8000-000000000001',true,false)->>'status','duplicate','queued retry still creates one alcohol entry');
select extensions.is(public.log_drink((select (value#>>'{}')::uuid from state where key='host'),(select (value#>>'{}')::uuid from state where key='plan'),null,clock_timestamp(),gen_random_uuid(),true,true)->>'code','plan_required','archived plan cannot authorize new water-only alcohol entries');

insert into state values ('invite',public.create_night_invite((select (value->>'nightId')::uuid from state where key='night'),repeat('a',64),clock_timestamp()+interval '24 hours',null));
select extensions.is(public.create_night_invite((select (value->>'nightId')::uuid from state where key='night'),repeat('a',64),clock_timestamp()+interval '24 hours',null)->>'inviteId',(select value->>'inviteId' from state where key='invite'),'create retry returns the same invitation');
insert into state values ('rotation',public.rotate_night_invite((select (value->>'nightId')::uuid from state where key='night'),repeat('b',64),clock_timestamp()+interval '24 hours',null));
select extensions.is(public.rotate_night_invite((select (value->>'nightId')::uuid from state where key='night'),repeat('b',64),clock_timestamp()+interval '24 hours',null)->>'inviteId',(select value->>'inviteId' from state where key='rotation'),'rotation retry returns the same invitation');
select extensions.is(public.get_invite_preview(repeat('a',64))->>'valid','false','rotation revokes the earlier link');
select public.revoke_night_invite_once((select (value->>'nightId')::uuid from state where key='night'),repeat('c',64)) is not null;
select public.create_night_invite((select (value->>'nightId')::uuid from state where key='night'),repeat('d',64),clock_timestamp()+interval '24 hours',null) is not null;
select public.revoke_night_invite_once((select (value->>'nightId')::uuid from state where key='night'),repeat('c',64)) is not null;
select extensions.is(public.get_invite_preview(repeat('d',64))->>'valid','true','revocation retry does not revoke a newer link');
select extensions.is(public.get_invite_preview(repeat('b',64))->>'valid','false','the originally revoked link remains invalid');

insert into state values ('report',to_jsonb(public.submit_support_request('30000000-0000-4000-8000-000000000001','problem','A sample problem for the operator.')));
select extensions.is(public.submit_support_request('30000000-0000-4000-8000-000000000001','problem','A sample problem for the operator.'),(select (value#>>'{}')::uuid from state where key='report'),'report retry returns the same reference');
select extensions.is((select count(*) from public.support_requests),1::bigint,'support retry stores one row');
insert into state values ('deletion',to_jsonb(public.submit_support_request('30000000-0000-4000-8000-000000000002','deletion','Please review my account for deletion.')));
select extensions.is(public.submit_support_request('30000000-0000-4000-8000-000000000003','deletion','Please review my account for deletion.'),(select (value#>>'{}')::uuid from state where key='deletion'),'only one open deletion request per account');
select extensions.is((select count(*) from public.profiles where id=auth.uid()),1::bigint,'deletion request does not remove the account');
select extensions.throws_ok($$update public.support_requests set user_id='00000000-0000-4000-8000-000000000002'$$,'42501',null,'request owners cannot reassign or change status');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*) from public.support_requests),0::bigint,'another account cannot read reports or deletion requests');
select public.redeem_night_invite(repeat('d',64)) is not null;
select public.redeem_night_invite(repeat('d',64)) is not null;
select extensions.is((select count(*) from public.night_members where user_id=auth.uid()),1::bigint,'invitation redemption retry creates one membership');
select extensions.is(public.log_water((select (value#>>'{}')::uuid from state where key='guest'),clock_timestamp(),gen_random_uuid())->>'code','permission_denied','water-only support does not widen guest management permissions');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.end_night((select (value->>'nightId')::uuid from state where key='night')) is not null;
select extensions.is((select count(*) from public.nights where status='ended'),1::bigint,'host can see finished-night history');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*) from public.nights where status='ended'),1::bigint,'current member can see finished-night history');
select extensions.lives_ok(format('select public.get_night_snapshot(%L::uuid)',(select value->>'nightId' from state where key='night')),'current member can open the finished summary');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select extensions.is((select count(*) from public.nights where status='ended'),0::bigint,'outsider sees no finished nights');
select extensions.throws_ok(format('select public.get_night_snapshot(%L::uuid)',(select value->>'nightId' from state where key='night')),'42501',null,'outsider cannot open a summary by guessed ID');
reset role;
update public.night_members set left_at=clock_timestamp() where user_id='00000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.is((select count(*) from public.nights where status='ended'),0::bigint,'departed member loses history access');
select extensions.throws_ok(format('select public.get_night_snapshot(%L::uuid)',(select value->>'nightId' from state where key='night')),'42501',null,'departed member loses summary access');
reset role;
select extensions.ok(not has_table_privilege('anon','public.support_requests','SELECT'),'anonymous users cannot read requests');
select extensions.ok(not has_function_privilege('anon','public.submit_support_request(uuid,text,text)','EXECUTE'),'anonymous users cannot submit account requests');
select * from extensions.finish(true);
rollback;
