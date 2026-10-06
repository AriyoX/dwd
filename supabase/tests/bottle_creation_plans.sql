begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(28);

select extensions.ok(not has_function_privilege('anon', 'public.share_bottle_and_plan(uuid,jsonb,uuid,integer,uuid,boolean,integer,boolean)', 'EXECUTE'), 'sharing with main choices requires authentication');
insert into auth.users(id, email, raw_user_meta_data) values
 ('bc100000-0000-4000-8000-000000000001', 'bottle-plans-host@example.test', '{"display_name":"Host","age_confirmed":true}'),
 ('bc100000-0000-4000-8000-000000000002', 'bottle-plans-friend@example.test', '{"display_name":"Friend","age_confirmed":true}');
create temporary table bottle_state(key text primary key, value uuid);
grant all on bottle_state to authenticated;
create function pg_temp.bid(text) returns uuid language sql as 'select value from bottle_state where key = $1';
create function pg_temp.rev(text) returns integer language sql as 'select plan_revision from public.night_members where id = pg_temp.bid($1)';
create function pg_temp.bottle(p_id uuid) returns jsonb language sql as $$
 select jsonb_build_object('id',p_id,'label','Shared gin','category','spirit','volumeMl',750,'abvPercent',40,'pourMl',30,'defaultQuantity',2,'access','everyone','allowedMemberIds','[]'::jsonb);
$$;
create function pg_temp.share_call(p_id uuid, p_member text, p_revision integer, p_creator_revision integer,
 p_main boolean default false, p_creator_main boolean default false, p_key uuid default gen_random_uuid())
returns text language sql as $$
 select format('select public.share_bottle_and_plan(%L,%L,%L,%s,%L,%L,%s,%L)',
 pg_temp.bid('night'),pg_temp.bottle(p_id),pg_temp.bid(p_member),p_revision,p_key,p_main,p_creator_revision,p_creator_main);
$$;
insert into bottle_state values
 ('bottle','bc200000-0000-4000-8000-000000000001'),
 ('request','bc300000-0000-4000-8000-000000000001'),
 ('stale-host','bc200000-0000-4000-8000-000000000002'),
 ('stale-guest','bc200000-0000-4000-8000-000000000003'),
 ('full-plan','bc200000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
with started as (
 select public.start_night_out(gen_random_uuid(),'Bottle plans',clock_timestamp()+interval '3 hours','UTC',
 '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":2,"isQuickLog":true}]',
 '[{"displayName":"Guest","planItems":[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":2,"isQuickLog":true}]}]') value
)
insert into bottle_state select 'night',(value->>'nightId')::uuid from started;
insert into bottle_state select 'host',id from public.night_members where night_id=pg_temp.bid('night') and user_id=auth.uid();
insert into bottle_state select 'guest',id from public.night_members where night_id=pg_temp.bid('night') and member_type='guest';
select public.create_night_invite(pg_temp.bid('night'),repeat('b',64),clock_timestamp()+interval '2 hours',5) is not null;
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
select public.redeem_night_invite(repeat('b',64)) is not null;
insert into bottle_state select 'friend',id from public.night_members where night_id=pg_temp.bid('night') and user_id=auth.uid();
select public.replace_member_plan_v2(pg_temp.bid('friend'),
 '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":2,"isQuickLog":true}]',0) is not null;
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000001',true);
select public.log_drink(pg_temp.bid('host'),(select id from public.drink_plan_items where night_member_id=pg_temp.bid('host') and archived_at is null),null,clock_timestamp(),gen_random_uuid(),false,false) is not null;

select extensions.lives_ok(pg_temp.share_call(pg_temp.bid('bottle'),'guest',0,0,false,true,pg_temp.bid('request')), 'sharing while tracking a guest also adds to the host plan');
select extensions.is((select count(*) from public.drink_plan_items where night_member_id in (pg_temp.bid('host'),pg_temp.bid('guest')) and archived_at is null and shared_bottle_id=pg_temp.bid('bottle') and planned_quantity=2),2::bigint,'both people get the requested individual quantity');
select extensions.is((select shared_bottle_id from public.drink_plan_items where night_member_id=pg_temp.bid('host') and archived_at is null and is_quick_log),pg_temp.bid('bottle'),'host can make the bottle their main drink');
select extensions.is((select label from public.drink_plan_items where night_member_id=pg_temp.bid('guest') and archived_at is null and is_quick_log),'Wine','guest independently keeps their existing main drink');
select extensions.is((select count(*) from public.drink_plan_items where night_member_id=pg_temp.bid('host') and archived_at is null),2::bigint,'host keeps their previous planned drink');
select extensions.is((select count(*) from public.drink_logs where night_member_id=pg_temp.bid('host') and deleted_at is null),1::bigint,'existing logs survive both plan updates');
select extensions.ok((select pg_temp.bid('host')=any(joined_member_ids) and pg_temp.bid('guest')=any(joined_member_ids) and not pg_temp.bid('friend')=any(joined_member_ids) from public.shared_bottles where id=pg_temp.bid('bottle')),'everyone access joins the creator and tracked guest, without enrolling other accounts');
select extensions.is((select count(*) from public.drink_plan_items where night_member_id=pg_temp.bid('friend') and shared_bottle_id=pg_temp.bid('bottle') and archived_at is null),0::bigint,'sharing never silently changes another account plan');

select public.plan_shared_bottle(pg_temp.bid('bottle'),pg_temp.bid('host'),3,25,1,gen_random_uuid(),true) is not null;
select public.plan_shared_bottle(pg_temp.bid('bottle'),pg_temp.bid('guest'),4,30,1,gen_random_uuid(),true) is not null;
select extensions.lives_ok(pg_temp.share_call(pg_temp.bid('bottle'),'guest',0,0,true,false,pg_temp.bid('request')),'a lost creation response recovers despite stale revisions and changed choices');
select extensions.is((select planned_quantity from public.drink_plan_items where night_member_id=pg_temp.bid('host') and archived_at is null and shared_bottle_id=pg_temp.bid('bottle')),3,'replay does not reset the host later quantity');
select extensions.is((select planned_quantity from public.drink_plan_items where night_member_id=pg_temp.bid('guest') and archived_at is null and shared_bottle_id=pg_temp.bid('bottle')),4,'replay does not reset the guest later quantity');
select extensions.is(pg_temp.rev('host'),2,'replay does not increment host revision');
select extensions.is(pg_temp.rev('guest'),2,'replay does not increment guest revision');
select extensions.throws_ok(pg_temp.share_call(pg_temp.bid('stale-host'),'guest',2,0),'40001','Your own plan changed. Close this window and try again.','a stale host plan rejects the entire creation');
select extensions.throws_ok(pg_temp.share_call(pg_temp.bid('stale-guest'),'guest',0,2),'40001','Your plan changed. Close this window and try again.','a stale guest plan rejects the entire creation');
select extensions.is((select count(*) from public.shared_bottles where id in (pg_temp.bid('stale-host'),pg_temp.bid('stale-guest'))),0::bigint,'stale saves leave no bottles or partial joins');
select extensions.throws_ok(pg_temp.share_call(pg_temp.bid('stale-host'),'guest',2,2,false,false,pg_temp.bid('request')),'22023','This request belongs to another bottle.','a creation key cannot be reused for another bottle');
select extensions.throws_ok(pg_temp.share_call(pg_temp.bid('bottle'),'guest',2,2),'22023','This bottle is already shared. Join or adjust it instead.','an existing bottle cannot be recreated with a new key');
select extensions.throws_ok(pg_temp.share_call(gen_random_uuid(),'friend',1,2),'42501','Bottle unavailable.','host cannot create a plan for another account');

-- A second-plan failure must roll back the first plan, bottle and retry record too.
select public.replace_member_plan_v2(pg_temp.bid('host'),
 (select jsonb_agg(jsonb_build_object('label','Drink '||i,'category','beer','volumeMl',330,'abvPercent',5,'plannedQuantity',2,'isQuickLog',i=1)) from generate_series(1,20) i),2) is not null;
select extensions.throws_matching(pg_temp.share_call(pg_temp.bid('full-plan'),'guest',2,3),'between 0 and 20 items','a full host plan rejects both saves');
select extensions.is((select count(*) from public.shared_bottles where id=pg_temp.bid('full-plan')),0::bigint,'a second-plan failure leaves no bottle');
select extensions.is(pg_temp.rev('guest'),2,'a second-plan failure restores the guest revision');
select extensions.is((select planned_quantity from public.drink_plan_items where night_member_id=pg_temp.bid('guest') and archived_at is null and shared_bottle_id=pg_temp.bid('bottle')),4,'a second-plan failure preserves the guest plan');

select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
select extensions.lives_ok(format('select public.plan_shared_bottle(%L,%L,2,30,1,%L,false)',pg_temp.bid('bottle'),pg_temp.bid('friend'),gen_random_uuid()),'another account can join while keeping its main drink');
select extensions.is((select label from public.drink_plan_items where night_member_id=pg_temp.bid('friend') and archived_at is null and is_quick_log),'Beer','joining with main unchecked keeps the original main drink');
select extensions.lives_ok(pg_temp.share_call(gen_random_uuid(),'friend',2,2,false,true),'sharing for oneself updates only one plan even if creator choice differs');
select extensions.is(pg_temp.rev('friend'),3,'self-sharing increments the plan revision once');

select * from extensions.finish();
rollback;
