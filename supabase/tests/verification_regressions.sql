begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

insert into auth.users(id, email, raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001', 'review-host@example.test', '{"display_name":"Review Host","age_confirmed":true}');
create temporary table review_state(key text primary key, value jsonb);
grant all on review_state to authenticated, service_role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into review_state values ('night', public.start_night_out(
 '21000000-0000-4000-8000-000000000001', 'Review night', clock_timestamp() + interval '2 hours',
 'Africa/Nairobi', '[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":1,"isQuickLog":true}]', '[]'));
insert into review_state select 'member', to_jsonb(id) from public.night_members where user_id = auth.uid();
select public.update_notification_preferences(true, true, true, true, true, 60) is not null;

select extensions.ok(not has_column_privilege('authenticated', 'public.notification_events', 'acknowledged_at', 'UPDATE'), 'notification acknowledgement cannot bypass its RPC');
select extensions.ok(not has_column_privilege('authenticated', 'public.checkin_requests', 'status', 'UPDATE'), 'check-in status cannot bypass its RPC');
select extensions.lives_ok($test$
 select public.log_drink(
  (select (value#>>'{}')::uuid from review_state where key = 'member'),
  (select id from public.drink_plan_items where night_member_id = (select (value#>>'{}')::uuid from review_state where key = 'member') and archived_at is null),
  null, clock_timestamp(), '22000000-0000-4000-8000-000000000001', false, false)
$test$, 'reaching a plan still saves with all reminder preferences enabled');
select extensions.is((select count(*) from public.drink_logs where actor_user_id = auth.uid()), 1::bigint, 'plan-reached notification cannot roll back the drink');

reset role;
update public.nights set starts_at = clock_timestamp() - interval '3 hours',
 initial_ends_at = clock_timestamp() - interval '1 minute', ends_at = clock_timestamp() - interval '1 minute'
where id = (select (value->>'nightId')::uuid from review_state where key = 'night');
set local role authenticated;
select public.get_my_notification_events(50) is not null;
select extensions.is((select count(*) from public.notification_events where event_type = 'planned_end'), 1::bigint, 'foreground inbox generates a due reminder without push configuration');
select public.update_notification_preferences(true, true, true, true, true, 60) is not null;
select public.get_my_notification_events(50) is not null;
select extensions.is((select count(*) from public.notification_events where event_type = 'planned_end'), 1::bigint, 'saving preferences does not repeat the same planned-end reminder');

-- An endpoint from the supported provider is a fixture; no network request is sent.
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/review-fixture', repeat('p', 32), repeat('a', 16)) is not null;
select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role service_role;
select public.claim_notification_jobs(10) is not null;
reset role;
update public.notification_deliveries set next_attempt_at = clock_timestamp() - interval '1 minute' where status = 'sending';
set local role service_role;
select extensions.ok(jsonb_array_length(public.claim_notification_jobs(10)) > 0, 'expired worker lease can be retried after a crash');
reset role;
insert into review_state select 'delivery', jsonb_build_object('id', id, 'attempt', attempts)
from public.notification_deliveries where status = 'sending' limit 1;
set local role service_role;
select extensions.is(public.complete_notification_job(
 (select (value->>'id')::uuid from review_state where key = 'delivery'), true, false, null, 1
)->>'updated', 'false', 'late acknowledgement from expired worker cannot finish a newer attempt');
select extensions.is(public.complete_notification_job(
 (select (value->>'id')::uuid from review_state where key = 'delivery'), true, false, null,
 (select (value->>'attempt')::integer from review_state where key = 'delivery')
)->>'updated', 'true', 'current worker attempt can acknowledge delivery');
reset role;
update public.notification_deliveries set status = 'failed', next_attempt_at = clock_timestamp() - interval '1 minute';
update public.push_subscriptions set expiration_time = clock_timestamp() - interval '1 second';
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 0, 'expired device subscriptions cannot receive queued events');
reset role;
update public.push_subscriptions set expiration_time = null;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select public.update_notification_preferences(false, false, false, false, false, 60) is not null;
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 0, 'opting out suppresses queued delivery retries');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select public.update_notification_preferences(true, true, true, true, true, 60) is not null;
select public.end_night((select (value->>'nightId')::uuid from review_state where key = 'night')) is not null;
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 0, 'ending a night suppresses queued reminders');
reset role;
select extensions.is((select count(*) from public.notification_schedules where night_id = (select (value->>'nightId')::uuid from review_state where key = 'night')), 0::bigint, 'ending removes periodic and planned-end schedules');

select * from extensions.finish(true);
rollback;
