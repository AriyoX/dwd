begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(26);

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.shared_bottles'::regclass), 'bottles have row security');
select extensions.ok(not has_table_privilege('authenticated', 'public.shared_bottles', 'INSERT,UPDATE,DELETE'), 'bottle writes cannot bypass the functions');
select extensions.ok(not has_function_privilege('anon', 'public.create_shared_bottle(uuid,jsonb)', 'EXECUTE'), 'anonymous users cannot create bottles');
select extensions.ok(not has_function_privilege('authenticated', 'private.log_drink_without_bottle(uuid,uuid,jsonb,timestamptz,uuid,boolean,boolean)', 'EXECUTE'), 'the internal logger cannot bypass bottle checks');

insert into auth.users(id, email, raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001', 'bottle-host@example.test', '{"display_name":"Host","age_confirmed":true}'),
 ('a1000000-0000-4000-8000-000000000002', 'bottle-member@example.test', '{"display_name":"Member","age_confirmed":true}'),
 ('a1000000-0000-4000-8000-000000000003', 'bottle-outsider@example.test', '{"display_name":"Outsider","age_confirmed":true}');
create temporary table bottle_state(key text primary key, value uuid);
grant all on bottle_state to authenticated;
create function pg_temp.bottle_id(text) returns uuid language sql as 'select value from bottle_state where key = $1';
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
with started as (select public.start_night_out('a2000000-0000-4000-8000-000000000001','Bottle tests',clock_timestamp()+interval '3 hours','UTC',
 '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":1,"isQuickLog":true}]',
 '[{"displayName":"Guest","planItems":[]}]') value)
insert into bottle_state values ('night',(select (value->>'nightId')::uuid from started));
insert into bottle_state select 'host', id from public.night_members where night_id = pg_temp.bottle_id('night') and user_id = auth.uid();
insert into bottle_state select 'guest', id from public.night_members where night_id = pg_temp.bottle_id('night') and member_type = 'guest';
select public.create_night_invite(pg_temp.bottle_id('night'),repeat('d',64),clock_timestamp()+interval '2 hours',5) is not null;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select public.redeem_night_invite(repeat('d',64)) is not null;
insert into bottle_state select 'member', id from public.night_members where night_id = pg_temp.bottle_id('night') and user_id = auth.uid();
select public.replace_member_plan_v2(pg_temp.bottle_id('member'), '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":1,"isQuickLog":true}]',0) is not null;
insert into bottle_state values ('open','a3000000-0000-4000-8000-000000000001'),('private','a3000000-0000-4000-8000-000000000002');
select extensions.lives_ok(format('select public.create_shared_bottle(%L,%L)',pg_temp.bottle_id('night'),jsonb_build_object(
 'id',pg_temp.bottle_id('open'),'label','Gin','category','spirit','volumeMl',60,'abvPercent',40,'pourMl',30,'access','everyone','allowedMemberIds','[]'::jsonb)), 'a non-host can share a bottle');
select extensions.is((select cardinality(joined_member_ids) from public.shared_bottles where id=pg_temp.bottle_id('open')),1,'only creator joins automatically');
select extensions.lives_ok(format('select public.create_shared_bottle(%L,%L)',pg_temp.bottle_id('night'),jsonb_build_object(
 'id',pg_temp.bottle_id('open'),'label','Gin','category','spirit','volumeMl',60,'abvPercent',40,'pourMl',30,'access','everyone','allowedMemberIds','[]'::jsonb)), 'creation retry returns the same bottle');
select extensions.is((select count(*) from public.shared_bottles where night_id=pg_temp.bottle_id('night')),1::bigint,'retry does not duplicate bottles');
select public.create_shared_bottle(pg_temp.bottle_id('night'), jsonb_build_object('id',pg_temp.bottle_id('private'),'label','Private wine','category','wine','volumeMl',750,'abvPercent',12,'pourMl',150,'access','selected','allowedMemberIds',jsonb_build_array(pg_temp.bottle_id('guest')))) is not null;
select extensions.throws_ok(format('select public.set_shared_bottle_membership(%L,%L,true)',pg_temp.bottle_id('open'),pg_temp.bottle_id('guest')),'42501','Bottle unavailable.','a member cannot join on behalf of someone else’s guest');
select extensions.throws_ok(format('select public.create_shared_bottle(%L,%L)',pg_temp.bottle_id('night'),jsonb_build_object('id','a3000000-0000-4000-8000-000000000003','label','Bad list','category','spirit','volumeMl',750,'abvPercent',40,'pourMl',30,'access','selected','allowedMemberIds',jsonb_build_array('a9000000-0000-4000-8000-000000000001'))),'22023','Choose people from this night.','invite list rejects members outside this night');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(format('select public.set_shared_bottle_membership(%L,%L,true)',pg_temp.bottle_id('private'),pg_temp.bottle_id('host')),'42501','This bottle is for selected people.','host cannot join a bottle they were not invited to');
select extensions.lives_ok(format('select public.set_shared_bottle_membership(%L,%L,true)',pg_temp.bottle_id('private'),pg_temp.bottle_id('guest')),'host can join for their invited managed guest');
select extensions.throws_ok(format('select public.close_shared_bottle(%L)',pg_temp.bottle_id('open')),'42501','Only the person sharing this bottle can put it away.','host cannot close someone else’s bottle');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),null,jsonb_build_object('shared_bottle_id',pg_temp.bottle_id('open'),'volume_ml',30),clock_timestamp(),gen_random_uuid(),false,false)->>'code','bottle_unavailable','non-joined people cannot log pours');
select public.set_shared_bottle_membership(pg_temp.bottle_id('open'),pg_temp.bottle_id('host'),true) is not null;
select extensions.is((select plan_revision from public.night_members where id=pg_temp.bottle_id('host')),0,'joining does not change the plan');
select public.replace_member_plan_v2(pg_temp.bottle_id('host'), jsonb_build_array(jsonb_build_object('sharedBottleId',pg_temp.bottle_id('open'),'label','Gin','category','spirit','volumeMl',30,'abvPercent',40,'plannedQuantity',1,'isQuickLog',true)),0) is not null;
insert into bottle_state select 'plan',id from public.drink_plan_items where night_member_id=pg_temp.bottle_id('host') and archived_at is null;
select extensions.is((public.get_night_snapshot(pg_temp.bottle_id('night'))->'members'->0->'planItems'->0->>'sharedBottleId'),pg_temp.bottle_id('open')::text,'snapshot preserves the bottle on a personal plan');
select extensions.throws_ok(format('select public.set_shared_bottle_membership(%L,%L,false)',pg_temp.bottle_id('open'),pg_temp.bottle_id('host')),'22023','Remove this bottle from your plan before leaving.','leaving cannot silently break a plan');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),pg_temp.bottle_id('plan'),null,clock_timestamp(),'a4000000-0000-4000-8000-000000000001',false,false)->>'status','created','main-drink logging draws from the linked bottle');
select extensions.is((select (b->>'remainingMl')::numeric from jsonb_array_elements(public.get_night_snapshot(pg_temp.bottle_id('night'))->'sharedBottles') b where b->>'id'=pg_temp.bottle_id('open')::text),30::numeric,'a logged pour reduces the bottle');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),pg_temp.bottle_id('plan'),null,clock_timestamp(),'a4000000-0000-4000-8000-000000000002',false,false)->>'status','confirmation_required','bottle pours preserve plan warnings');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),pg_temp.bottle_id('plan'),null,clock_timestamp(),'a4000000-0000-4000-8000-000000000002',true,false)->>'status','created','confirmed second pour uses the remaining amount');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),pg_temp.bottle_id('plan'),null,clock_timestamp(),'a4000000-0000-4000-8000-000000000002',true,false)->>'status','duplicate','retry succeeds after emptying the bottle');
select extensions.is(public.log_drink(pg_temp.bottle_id('host'),pg_temp.bottle_id('plan'),null,clock_timestamp(),gen_random_uuid(),true,false)->>'code','bottle_empty','empty bottle rejects another pour');
select public.soft_delete_activity((select id from public.drink_logs where idempotency_key='a4000000-0000-4000-8000-000000000002'),'alcohol') is not null;
select extensions.is((select (b->>'remainingMl')::numeric from jsonb_array_elements(public.get_night_snapshot(pg_temp.bottle_id('night'))->'sharedBottles') b where b->>'id'=pg_temp.bottle_id('open')::text),30::numeric,'undo restores the pour to the bottle');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.shared_bottles),0::bigint,'outsiders cannot see bottles');
select extensions.throws_ok(format('select public.create_shared_bottle(%L,%L)',pg_temp.bottle_id('night'),'{}'),'42501','Bottle unavailable.','outsiders cannot create bottles');
select * from extensions.finish();
rollback;
