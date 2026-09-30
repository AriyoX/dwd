begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(28);

select extensions.ok(not has_function_privilege('anon', 'public.plan_shared_bottle(uuid,uuid,integer,numeric,integer,uuid,boolean)', 'EXECUTE'), 'anonymous users cannot plan from bottles');
select extensions.ok(not has_table_privilege('authenticated', 'private.bottle_plan_requests', 'SELECT,INSERT,UPDATE,DELETE'), 'retry records are private');
insert into auth.users(id, email, raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000001', 'tracking-host@example.test', '{"display_name":"Host","age_confirmed":true}'),
 ('b1000000-0000-4000-8000-000000000002', 'tracking-friend@example.test', '{"display_name":"Friend","age_confirmed":true}');
create temporary table tracking_state(key text primary key, value uuid);
grant all on tracking_state to authenticated;
create function pg_temp.tracking_id(text) returns uuid language sql as 'select value from tracking_state where key = $1';
create function pg_temp.tracking_bottle(p_id uuid, p_quantity integer default 2) returns jsonb language sql as $$
 select jsonb_build_object('id', p_id, 'label','Gin','category','spirit','volumeMl',750,'abvPercent',40,'pourMl',30,'defaultQuantity',p_quantity,'access','everyone','allowedMemberIds','[]'::jsonb);
$$;
insert into tracking_state values
 ('first','b2000000-0000-4000-8000-000000000001'),
 ('second','b2000000-0000-4000-8000-000000000002'),
 ('third','b2000000-0000-4000-8000-000000000003'),
 ('private','b2000000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
with started as (select public.start_night_with_bottle('b3000000-0000-4000-8000-000000000001','Bottle tracking',clock_timestamp()+interval '3 hours','UTC','[]','[{"displayName":"Guest","planItems":[]}]',pg_temp.tracking_bottle(pg_temp.tracking_id('first'))) value)
insert into tracking_state values ('night',(select (value->>'nightId')::uuid from started));
insert into tracking_state select 'host',id from public.night_members where night_id=pg_temp.tracking_id('night') and user_id=auth.uid();
insert into tracking_state select 'guest',id from public.night_members where night_id=pg_temp.tracking_id('night') and member_type='guest';
select extensions.is((select count(*) from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and shared_bottle_id=pg_temp.tracking_id('first') and is_quick_log and planned_quantity=2 and volume_ml=30),1::bigint,'starting a night creates the bottle and main plan together');
select extensions.ok((select plan_setup_completed_at is not null from public.night_members where id=pg_temp.tracking_id('host')),'host goes directly to tracking');
select extensions.is((public.get_night_snapshot(pg_temp.tracking_id('night'))->'sharedBottles'->0->>'defaultQuantity')::integer,2,'snapshot includes the default personal quantity');
select public.plan_shared_bottle(pg_temp.tracking_id('first'),pg_temp.tracking_id('host'),3,25,1,'b3000000-0000-4000-8000-000000000002',true) is not null;
select extensions.lives_ok(format('select public.start_night_with_bottle(%L,%L,clock_timestamp()+interval ''3 hours'',%L,%L,%L,%L)','b3000000-0000-4000-8000-000000000001','Bottle tracking','UTC','[]','[]',pg_temp.tracking_bottle(pg_temp.tracking_id('first'))),'retrying night creation recovers the saved result');
select extensions.is((select planned_quantity from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null),3,'night creation retry does not reset later adjustments');
select public.replace_member_plan_v2(pg_temp.tracking_id('host'),jsonb_build_array(jsonb_build_object('sharedBottleId',pg_temp.tracking_id('first'),'label','Gin','category','spirit','volumeMl',25,'abvPercent',40,'plannedQuantity',3,'isQuickLog',false),'{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":1,"isQuickLog":true}'::jsonb),2) is not null;
select public.share_bottle_and_plan(pg_temp.tracking_id('night'),pg_temp.tracking_bottle(pg_temp.tracking_id('second')),pg_temp.tracking_id('host'),3,'b3000000-0000-4000-8000-000000000003') is not null;
select extensions.is((select count(*) from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null),3::bigint,'adding another bottle preserves earlier bottle and ordinary drinks');
select extensions.is((select shared_bottle_id from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and is_quick_log),pg_temp.tracking_id('second'),'newly added bottle becomes the only main drink');
select extensions.is((select count(*) from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and label='Beer' and not is_quick_log),1::bigint,'the old main drink stays in the plan');
select public.close_shared_bottle(pg_temp.tracking_id('first')) is not null;
select extensions.lives_ok(format('select public.share_bottle_and_plan(%L,%L,%L,4,%L)',pg_temp.tracking_id('night'),pg_temp.tracking_bottle(pg_temp.tracking_id('third')),pg_temp.tracking_id('host'),'b3000000-0000-4000-8000-000000000004'),'a put-away bottle in the plan does not block a new bottle');
insert into tracking_state select 'plan',id from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and shared_bottle_id=pg_temp.tracking_id('second');
select extensions.is(public.log_drink(pg_temp.tracking_id('host'),pg_temp.tracking_id('plan'),null,clock_timestamp(),gen_random_uuid(),false,false)->>'status','created','the automatically created plan can log immediately');
select public.plan_shared_bottle(pg_temp.tracking_id('second'),pg_temp.tracking_id('host'),3,30,5,'b3000000-0000-4000-8000-000000000005',false) is not null;
select extensions.is((select shared_bottle_id from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and is_quick_log),pg_temp.tracking_id('third'),'adjusting a non-main bottle respects the chosen main drink');
select extensions.is((select count(*) from public.drink_logs where night_member_id=pg_temp.tracking_id('host') and shared_bottle_id=pg_temp.tracking_id('second') and deleted_at is null),1::bigint,'plan adjustments keep earlier bottle drinks and their source');
select extensions.lives_ok(format('select public.plan_shared_bottle(%L,%L,2,30,0,%L,true)',pg_temp.tracking_id('second'),pg_temp.tracking_id('host'),'b3000000-0000-4000-8000-000000000005'),'a lost response can be retried despite an old revision');
select extensions.is((select planned_quantity from public.drink_plan_items where night_member_id=pg_temp.tracking_id('host') and archived_at is null and shared_bottle_id=pg_temp.tracking_id('second')),3,'replay does not reapply changed form values');
select extensions.throws_ok(format('select public.share_bottle_and_plan(%L,%L,%L,0,%L)',pg_temp.tracking_id('night'),pg_temp.tracking_bottle('b2000000-0000-4000-8000-000000000010'),pg_temp.tracking_id('host'),gen_random_uuid()),'40001','Your plan changed. Close this window and try again.','stale forms cannot replace newer plans');
select extensions.is((select count(*) from public.shared_bottles where id='b2000000-0000-4000-8000-000000000010'),0::bigint,'failed plan save rolls back bottle creation');
select public.share_bottle_and_plan(pg_temp.tracking_id('night'),pg_temp.tracking_bottle(pg_temp.tracking_id('private')) || jsonb_build_object('access','selected','allowedMemberIds',jsonb_build_array(pg_temp.tracking_id('guest'))),pg_temp.tracking_id('guest'),0,gen_random_uuid()) is not null;
select extensions.is((select shared_bottle_id from public.drink_plan_items where night_member_id=pg_temp.tracking_id('guest') and archived_at is null and is_quick_log),pg_temp.tracking_id('private'),'a manager can share and plan for an invited guest');
select public.create_night_invite(pg_temp.tracking_id('night'),repeat('e',64),clock_timestamp()+interval '2 hours',5) is not null;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select public.redeem_night_invite(repeat('e',64)) is not null;
insert into tracking_state select 'friend',id from public.night_members where night_id=pg_temp.tracking_id('night') and user_id=auth.uid();
select extensions.lives_ok(format('select public.plan_shared_bottle(%L,%L,3,30,0,%L,true)',pg_temp.tracking_id('second'),pg_temp.tracking_id('friend'),gen_random_uuid()),'a joining person chooses a quantity and starts tracking in one action');
select extensions.ok((select pg_temp.tracking_id('friend')=any(joined_member_ids) from public.shared_bottles where id=pg_temp.tracking_id('second')),'planning also joins the bottle');
select extensions.throws_ok(format('select public.plan_shared_bottle(%L,%L,2,30,0,%L,true)',pg_temp.tracking_id('third'),pg_temp.tracking_id('friend'),gen_random_uuid()),'40001','Your plan changed. Close this window and try again.','joining rejects a stale personal plan');
select extensions.ok((select not pg_temp.tracking_id('friend')=any(joined_member_ids) from public.shared_bottles where id=pg_temp.tracking_id('third')),'failed joining does not leave a membership behind');
select extensions.throws_ok(format('select public.plan_shared_bottle(%L,%L,2,30,1,%L,true)',pg_temp.tracking_id('private'),pg_temp.tracking_id('friend'),gen_random_uuid()),'42501','This bottle is for selected people.','auto-planning still respects selected sharing');
select extensions.throws_ok(format('select public.plan_shared_bottle(%L,%L,2,30,6,%L,true)',pg_temp.tracking_id('second'),pg_temp.tracking_id('host'),gen_random_uuid()),'42501','Bottle unavailable.','a participant cannot change another account’s plan');
select extensions.throws_ok(format('select public.plan_shared_bottle(%L,%L,2,800,1,%L,true)',pg_temp.tracking_id('third'),pg_temp.tracking_id('friend'),gen_random_uuid()),'22023','Check the drink size.','invalid serving sizes roll back joining');
select extensions.ok((select not pg_temp.tracking_id('friend')=any(joined_member_ids) from public.shared_bottles where id=pg_temp.tracking_id('third')),'invalid size does not partially join a bottle');
select extensions.lives_ok(format('select public.share_bottle_and_plan(%L,%L,%L,1,%L)',pg_temp.tracking_id('night'),pg_temp.tracking_bottle('b2000000-0000-4000-8000-000000000011'),pg_temp.tracking_id('friend'),gen_random_uuid()),'non-hosts can add a new bottle directly to their plans');
select * from extensions.finish();
rollback;
