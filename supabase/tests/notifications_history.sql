begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(34);

insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at) values
 ('10000000-0000-4000-8000-000000000001', 'notify-host@dwd.test', '{"display_name":"Host One","age_confirmed":true}', now(), now()),
 ('10000000-0000-4000-8000-000000000002', 'notify-member@dwd.test', '{"display_name":"Member Two","age_confirmed":true}', now(), now()),
 ('10000000-0000-4000-8000-000000000003', 'notify-outsider@dwd.test', '{"display_name":"Outsider Three","age_confirmed":true}', now(), now());
create temporary table test_state(key text primary key, value jsonb);
grant all on test_state to authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into test_state values (
  'night',
  public.start_night_out(
    '11000000-0000-4000-8000-000000000001',
    'Notification night',
    clock_timestamp() + interval '2 hours',
    'Africa/Nairobi',
    '[]',
    '[]'
  )
);
insert into test_state
select 'host', to_jsonb(id) from public.night_members where night_id = (select (value->>'nightId')::uuid from test_state where key = 'night') and role = 'host';
insert into test_state values (
  'invite',
  public.create_night_invite(
    (select (value->>'nightId')::uuid from test_state where key = 'night'),
    repeat('1', 64),
    clock_timestamp() + interval '24 hours',
    null
  )
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.redeem_night_invite(repeat('1', 64)) is not null;
insert into test_state
select 'member', to_jsonb(id) from public.night_members where user_id = '10000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*) from pg_tables where schemaname = 'public' and tablename in (
    'notification_preferences', 'notification_events', 'push_subscriptions',
    'notification_schedules', 'notification_deliveries', 'checkin_requests'
  ) and rowsecurity),
  6::bigint,
  'notification tables have RLS enabled'
);
select extensions.is(public.get_notification_preferences()->>'groupAttentionEnabled', 'true', 'notification preferences default to group attention');
select extensions.is(public.update_notification_preferences(false, true, false, false, false, 60)->>'groupAttentionEnabled', 'false', 'account can update its own notification preferences');
select extensions.is((select count(*) from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'account cannot read another preference row');
select extensions.throws_ok(
  $$insert into public.notification_events (event_key, recipient_user_id, category, event_type, title, body, deep_link) values ('forged', '10000000-0000-4000-8000-000000000002', 'direct_checkin', 'direct_checkin', 'Forged', 'Forged', '/account')$$,
  '42501',
  'permission denied for table notification_events',
  'browser cannot forge notification events'
);
select extensions.is(
  (public.register_push_subscription('https://push.example.test/dwd-recipient-endpoint', repeat('p', 32), repeat('a', 16))->>'id') is not null,
  true,
  'recipient can register one device subscription'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  format('select public.send_check_in(%L::uuid, %L::uuid, %L::uuid)', (select (value->>'nightId')::uuid from test_state where key = 'night'), (select (value#>>'{}')::uuid from test_state where key = 'host'), '12000000-0000-4000-8000-000000000003'),
  '22023',
  'You cannot check in on yourself.',
  'self check-ins are rejected'
);
select extensions.is(
  public.send_check_in(
    (select (value->>'nightId')::uuid from test_state where key = 'night'),
    (select (value#>>'{}')::uuid from test_state where key = 'member'),
    '12000000-0000-4000-8000-000000000001'
  )->>'status',
  'sent',
  'account participant can send a check-in'
);
select extensions.is(
  public.send_check_in(
    (select (value->>'nightId')::uuid from test_state where key = 'night'),
    (select (value#>>'{}')::uuid from test_state where key = 'member'),
    '12000000-0000-4000-8000-000000000001'
  )->>'status',
  'sent',
  'repeating a check-in request key is idempotent'
);
select extensions.is(
  public.send_check_in(
    (select (value->>'nightId')::uuid from test_state where key = 'night'),
    (select (value#>>'{}')::uuid from test_state where key = 'member'),
    '12000000-0000-4000-8000-000000000002'
  )->>'status',
  'cooldown',
  'fresh check-in requests obey the sixty second cooldown'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 1, 'worker claims one push delivery');
select extensions.is(jsonb_array_length(public.claim_notification_jobs(10)), 0, 'repeated worker claim does not duplicate delivery');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.notification_events where recipient_user_id = auth.uid()), 1::bigint, 'recipient can read one direct notification');
select extensions.is((select count(*) from public.notification_events where recipient_user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'direct notification is not exposed to sender');
select extensions.is((public.get_my_notification_events(10)::jsonb -> 0 ->> 'eventType'), 'direct_checkin', 'recipient inbox contains the direct event');
select extensions.lives_ok(
  format('select public.acknowledge_notification(%L::uuid)', (select id from public.notification_events where recipient_user_id = auth.uid() limit 1)),
  'recipient can acknowledge the notification'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  format('select public.acknowledge_notification(%L::uuid)', (select id from public.notification_events where recipient_user_id = '10000000-0000-4000-8000-000000000002' limit 1)),
  '42501',
  'Notification not found.',
  'another recipient cannot acknowledge private notification'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select public.update_own_display_name('Member Renamed')$$,
  'account can update its own display name'
);
select extensions.is((select display_name from public.profiles where id = auth.uid()), 'Member Renamed', 'profile row stores the renamed display name');
select extensions.is((select count(*) from public.night_members where user_id = auth.uid() and left_at is null and display_name = 'Member Renamed'), 1::bigint, 'one active membership is eligible for propagation');
select extensions.is(
  (select display_name from public.night_members where id = (select (value#>>'{}')::uuid from test_state where key = 'member')),
  'Member Renamed',
  'active membership receives the renamed display name'
);
select extensions.throws_ok(
  $$select public.update_own_display_name('')$$,
  '22023',
  'Display name must be between 1 and 60 characters.',
  'blank display name is rejected'
);

reset role;
update public.night_members
set left_at = clock_timestamp()
where id = (select (value#>>'{}')::uuid from test_state where key = 'member');
update public.profiles
set display_name = 'Member Rejoined'
where id = '10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select public.redeem_night_invite(repeat('1', 64)) is not null;
select extensions.is(
  (select count(*) from public.night_members where night_id = (select (value->>'nightId')::uuid from test_state where key = 'night') and user_id = '10000000-0000-4000-8000-000000000002'),
  1::bigint,
  'rejoining reuses the account membership'
);
select extensions.is(
  (select display_name from public.night_members where id = (select (value#>>'{}')::uuid from test_state where key = 'member')),
  'Member Rejoined',
  'rejoining refreshes the active membership name'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  format('select public.replace_member_plan_v2(%L::uuid, %L::jsonb, 0)', (select (value#>>'{}')::uuid from test_state where key = 'host'), '[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":1,"isQuickLog":true}]'),
  'first plan edit accepts the expected revision'
);
select extensions.throws_ok(
  format('select public.replace_member_plan_v2(%L::uuid, %L::jsonb, 0)', (select (value#>>'{}')::uuid from test_state where key = 'host'), '[]'),
  '40001',
  'This plan changed in another tab. Reload and review it.',
  'stale plan revision is rejected atomically'
);

select extensions.lives_ok(
  format('select public.end_night(%L::uuid)', (select (value->>'nightId')::uuid from test_state where key = 'night')),
  'host can end the notification night'
);
select extensions.is(
  (select display_name_at_end from public.night_members where id = (select (value#>>'{}')::uuid from test_state where key = 'member')),
  'Member Rejoined',
  'ending captures the historical membership name'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.is(jsonb_array_length(public.get_finished_nights(0)), 1, 'finished history includes a joined account');
select extensions.lives_ok(
  format('select public.get_finished_night_summary(%L::uuid)', (select (value->>'nightId')::uuid from test_state where key = 'night')),
  'joined account can open its restricted finished summary'
);
select extensions.is(
  public.get_finished_night_summary((select (value->>'nightId')::uuid from test_state where key = 'night')) -> 'members' -> 0 ->> 'displayName',
  'Member Rejoined',
  'finished summary keeps the historical display name'
);

reset role;
update public.night_members
set left_at = clock_timestamp()
where id = (select (value#>>'{}')::uuid from test_state where key = 'member');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select extensions.is(jsonb_array_length(public.get_finished_nights(0)), 1, 'departed participant retains personal history');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select extensions.is(jsonb_array_length(public.get_finished_nights(0)), 0, 'outsider cannot enumerate finished nights');
select extensions.throws_ok(
  format('select public.get_finished_night_summary(%L::uuid)', (select (value->>'nightId')::uuid from test_state where key = 'night')),
  '42501',
  'Night not found.',
  'outsider cannot open a former participant summary'
);

select * from extensions.finish(true);
rollback;
