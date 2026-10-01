begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

insert into auth.users(id, email, raw_user_meta_data) values
  ('71000000-0000-4000-8000-000000000001', 'message-recipient@example.test', '{"display_name":"Recipient","age_confirmed":true}'),
  ('71000000-0000-4000-8000-000000000002', 'message-outsider@example.test', '{"display_name":"Outsider","age_confirmed":true}');
create temporary table message_state(key text primary key, value jsonb);
grant all on message_state to authenticated, service_role;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into message_state values ('night', public.start_night_out(
  '72000000-0000-4000-8000-000000000001', 'Message night', clock_timestamp() + interval '2 hours',
  'Africa/Nairobi', '[]', '[]'
));
select public.update_notification_preferences(true, true, true, true, true, 60) is not null;
select public.register_push_subscription(
  'https://fcm.googleapis.com/fcm/send/message-fixture', repeat('p', 32), repeat('a', 16)
) is not null;

reset role;
update public.nights set starts_at = clock_timestamp() - interval '3 hours',
  initial_ends_at = clock_timestamp() - interval '1 minute', ends_at = clock_timestamp() - interval '1 minute'
where id = (select (value->>'nightId')::uuid from message_state where key = 'night');
delete from public.notification_schedules
where night_id = (select (value->>'nightId')::uuid from message_state where key = 'night');

insert into public.notification_events (
  event_key, recipient_user_id, night_id, category, event_type, title, body, deep_link, expires_at
)
select
  case when fixture.event_type = 'planned_end'
    then 'planned-end:' || n.id::text || ':' || extract(epoch from n.ends_at)::text
    else 'message:' || fixture.event_type end,
  '71000000-0000-4000-8000-000000000001', n.id,
  fixture.category, fixture.event_type, fixture.title, fixture.body,
  '/night/' || n.id::text, clock_timestamp() + interval '1 hour'
from public.nights n cross join (values
  ('personal_reminder', 'periodic_water', 'Quick check-in — anything to log?', 'Keep your night record up to date.'),
  ('personal_reminder', 'planned_end', 'Night check-in', 'Your planned night has ended.'),
  ('personal_reminder', 'personal_pace', 'Personal pace reminder', 'Your recent pace is faster than planned.'),
  ('direct_checkin', 'direct_checkin', 'Alex checked in on you', 'Alex checked in on you.'),
  ('group_attention', 'group_attention', 'Check in with Sam', 'Sam may need a check-in.')
) fixture(category, event_type, title, body)
where n.id = (select (value->>'nightId')::uuid from message_state where key = 'night');

select extensions.ok(not has_function_privilege('authenticated', 'public.claim_notification_jobs(integer)', 'EXECUTE'), 'browser accounts cannot claim message payloads');
select extensions.ok(not has_function_privilege('anon', 'public.claim_notification_jobs(integer)', 'EXECUTE'), 'anonymous clients cannot claim message payloads');
select extensions.ok(has_function_privilege('service_role', 'public.claim_notification_jobs(integer)', 'EXECUTE'), 'delivery worker can claim message payloads');

select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
insert into message_state values ('jobs', public.claim_notification_jobs(10));
select extensions.is(jsonb_array_length((select value from message_state where key = 'jobs')), 5, 'worker claims all five notification types');
reset role;
select extensions.is(job.value->>'title', e.title, e.event_type || ' push carries its actual title')
from jsonb_array_elements((select value from message_state where key = 'jobs')) job(value)
join public.notification_events e on e.id = (job.value->>'eventId')::uuid
order by e.event_type;
select extensions.is(job.value->>'body', e.body, e.event_type || ' push carries its actual message')
from jsonb_array_elements((select value from message_state where key = 'jobs')) job(value)
join public.notification_events e on e.id = (job.value->>'eventId')::uuid
order by e.event_type;
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 0, 'message changes do not duplicate claimed deliveries');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from jsonb_array_elements((select value from message_state where key = 'jobs')) job(value)
  where public.can_display_notification((job.value->>'eventId')::uuid)), 5::bigint, 'recipient can display each current message');
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from jsonb_array_elements((select value from message_state where key = 'jobs')) job(value)
  where public.can_display_notification((job.value->>'eventId')::uuid)), 0::bigint, 'switching accounts prevents displaying another account message');
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select public.acknowledge_notification(((select value from message_state where key = 'jobs')->0->>'eventId')::uuid) is not null;
select extensions.ok(not public.can_display_notification(((select value from message_state where key = 'jobs')->0->>'eventId')::uuid), 'read messages cannot be displayed by a delayed push');

reset role;
select * from extensions.finish(true);
rollback;
