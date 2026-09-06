begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(42);

select extensions.is(
  (
    select count(*)
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'profiles', 'nights', 'night_end_time_changes', 'night_members',
        'drink_plan_items', 'drink_logs', 'water_logs', 'night_invites',
        'night_alerts', 'audit_events'
      )
      and rowsecurity
  ),
  10::bigint,
  'RLS is enabled on every product table'
);
select extensions.ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  )
  and not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'UPDATE'
      and not (grantee = 'authenticated' and table_name = 'profiles')
  ),
  'browser roles cannot directly mutate product tables except own-profile display updates'
);
select extensions.ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('night_invites', 'audit_events')
      and grantee in ('anon', 'authenticated')
  ),
  'raw invite and audit tables have no browser privileges'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', 'host@dwd.test', '{"display_name":"Host","age_confirmed":true}', now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'member@dwd.test', '{"display_name":"Member","age_confirmed":true}', now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'outsider@dwd.test', '{"display_name":"Outsider","age_confirmed":true}', now(), now());

select extensions.is((select count(*) from public.profiles), 3::bigint, 'signup trigger creates profiles');
select extensions.throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000000004', 'invalid@dwd.test', '{"age_confirmed":true}')$$,
  '22023',
  'A valid display name is required.',
  'signup trigger rejects a missing display name'
);

create temporary table test_state (
  key text primary key,
  uuid_value uuid,
  time_value timestamptz
);
grant all on test_state to authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

with result as (
  select public.start_night_out(
    '10000000-0000-4000-8000-000000000001',
    'Database test night',
    clock_timestamp() + interval '2 hours',
    'Africa/Nairobi',
    '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":2,"isQuickLog":true}]',
    '[{"displayName":"Managed Guest","planItems":[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":2,"isQuickLog":true}]}]'
  ) value
)
insert into test_state (key, uuid_value)
select 'night', (value ->> 'nightId')::uuid from result;

select extensions.is(
  (select count(*) from public.nights where id = (select uuid_value from test_state where key = 'night')),
  1::bigint,
  'transactional start creates one night'
);
select extensions.is(
  (select count(*) from public.night_members where night_id = (select uuid_value from test_state where key = 'night') and role = 'host'),
  1::bigint,
  'transactional start creates one host'
);
select extensions.is(
  (select count(*) from public.night_members where night_id = (select uuid_value from test_state where key = 'night') and member_type = 'guest'),
  1::bigint,
  'transactional start creates the managed guest'
);
select extensions.is(
  (select count(*) from public.drink_plan_items where archived_at is null),
  2::bigint,
  'transactional start creates host and guest plans'
);

with retry as (
  select public.start_night_out(
    '10000000-0000-4000-8000-000000000001',
    'Ignored retry title',
    clock_timestamp() + interval '3 hours',
    'UTC',
    '[{"label":"Shot","category":"spirit","volumeMl":40,"abvPercent":40,"plannedQuantity":1,"isQuickLog":true}]',
    '[]'
  ) value
)
select extensions.is(value ->> 'duplicate', 'true', 'retrying start is idempotent') from retry;
select extensions.is(
  (select count(*) from public.nights),
  1::bigint,
  'retrying start does not duplicate the night'
);

with invite as (
  select public.create_night_invite(
    (select uuid_value from test_state where key = 'night'),
    repeat('a', 64),
    clock_timestamp() + interval '24 hours',
    5
  ) value
)
select extensions.ok((value ->> 'inviteId') is not null, 'host creates a hashed invite') from invite;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
with redemption as (select public.redeem_night_invite(repeat('a', 64)) value)
select extensions.is(value ->> 'joined', 'true', 'invitee redeems the invite') from redemption;
with redemption as (select public.redeem_night_invite(repeat('a', 64)) value)
select extensions.is(value ->> 'joined', 'false', 'repeat redemption is idempotent') from redemption;

reset role;
select extensions.is((select use_count from public.night_invites where token_hash = repeat('a', 64)), 1, 'repeat redemption increments use count only once');
set local role authenticated;

insert into test_state (key, uuid_value)
select 'member', id from public.night_members
where night_id = (select uuid_value from test_state where key = 'night')
  and user_id = '00000000-0000-4000-8000-000000000002';
insert into test_state (key, uuid_value)
select 'guest', id from public.night_members
where night_id = (select uuid_value from test_state where key = 'night')
  and member_type = 'guest';

with result as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Beer","category":"beer","volume_ml":330,"abv_percent":5}',
    clock_timestamp(),
    '20000000-0000-4000-8000-000000000001',
    false,
    false
  ) value
)
select extensions.is(value ->> 'code', 'plan_required', 'invitee needs their own plan before alcohol') from result;

select public.replace_member_plan(
  (select uuid_value from test_state where key = 'member'),
  '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":2,"isQuickLog":true}]'
) is not null;
insert into test_state (key, uuid_value)
select 'member_old_plan', id from public.drink_plan_items
where night_member_id = (select uuid_value from test_state where key = 'member') and archived_at is null;

with result as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    (select uuid_value from test_state where key = 'member_old_plan'),
    null,
    clock_timestamp(),
    '20000000-0000-4000-8000-000000000002',
    false,
    false
  ) value
)
select extensions.is(value ->> 'status', 'created', 'account participant logs for self') from result;
insert into test_state (key, time_value) values ('queued_before_plan_edit', clock_timestamp());

select public.replace_member_plan(
  (select uuid_value from test_state where key = 'member'),
  '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":4,"isQuickLog":true}]'
) is not null;
with result as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    (select uuid_value from test_state where key = 'member_old_plan'),
    null,
    (select time_value from test_state where key = 'queued_before_plan_edit'),
    '20000000-0000-4000-8000-000000000003',
    false,
    false
  ) value
)
select extensions.is(value ->> 'status', 'created', 'queued log resolves its archived plan version') from result;

with duplicate as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    (select uuid_value from test_state where key = 'member_old_plan'),
    null,
    (select time_value from test_state where key = 'queued_before_plan_edit'),
    '20000000-0000-4000-8000-000000000003',
    false,
    false
  ) value
)
select extensions.is(value ->> 'status', 'duplicate', 'duplicate idempotency key returns canonical log') from duplicate;
select extensions.is(
  (select count(*) from public.drink_logs where actor_user_id = '00000000-0000-4000-8000-000000000002'),
  2::bigint,
  'duplicate retry creates only one row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  format(
    'select public.replace_member_plan(%L::uuid, %L::jsonb)',
    (select uuid_value from test_state where key = 'member'),
    '[{"label":"Shot","category":"spirit","volumeMl":40,"abvPercent":40,"plannedQuantity":1,"isQuickLog":true}]'
  ),
  '42501',
  'You cannot edit this plan.',
  'host cannot edit another account plan'
);

with forbidden as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Beer","category":"beer","volume_ml":330,"abv_percent":5}',
    clock_timestamp(),
    '20000000-0000-4000-8000-000000000004',
    false,
    false
  ) value
)
select extensions.is(value ->> 'code', 'permission_denied', 'host cannot log for another account') from forbidden;

with guest_log as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'guest'),
    (select id from public.drink_plan_items where night_member_id = (select uuid_value from test_state where key = 'guest') and archived_at is null),
    null,
    clock_timestamp(),
    '20000000-0000-4000-8000-000000000005',
    false,
    false
  ) value
)
insert into test_state (key, uuid_value)
select 'guest_log', (value -> 'log' ->> 'id')::uuid from guest_log;
select extensions.ok((select uuid_value from test_state where key = 'guest_log') is not null, 'host logs for managed guest');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
with forbidden as (
  select public.log_water(
    (select uuid_value from test_state where key = 'guest'),
    clock_timestamp(),
    '30000000-0000-4000-8000-000000000001'
  ) value
)
select extensions.is(value ->> 'code', 'permission_denied', 'ordinary participant cannot log water for guest') from forbidden;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  format('select public.soft_delete_activity(%L::uuid, %L)', (select uuid_value from test_state where key = 'guest_log'), 'alcohol'),
  'guest manager can soft-delete guest log'
);
reset role;
select extensions.ok((select deleted_at from public.drink_logs where id = (select uuid_value from test_state where key = 'guest_log')) is not null, 'guest correction preserves soft-deleted row');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select extensions.throws_ok(
  format(
    'select public.soft_delete_activity(%L::uuid, %L)',
    (select id from public.drink_logs where actor_user_id = '00000000-0000-4000-8000-000000000002' order by created_at limit 1),
    'alcohol'
  ),
  '42501',
  'Log not found.',
  'host cannot delete an account participant log'
);
select extensions.throws_ok(
  format('select public.leave_night(%L::uuid)', (select uuid_value from test_state where key = 'night')),
  '55000',
  'The host must end the active night and cannot leave it.',
  'host cannot leave an active night'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.nights), 0::bigint, 'non-member cannot read a guessed night UUID');

reset role;
update public.nights
set starts_at = clock_timestamp() - interval '2 hours',
    initial_ends_at = clock_timestamp() - interval '1 minute',
    ends_at = clock_timestamp() - interval '1 minute'
where id = (select uuid_value from test_state where key = 'night');
insert into test_state (key, time_value) values ('before_extension', clock_timestamp() - interval '1 millisecond');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public.extend_night((select uuid_value from test_state where key = 'night'), 30) is not null;
select extensions.is((select count(*) from public.night_end_time_changes), 1::bigint, 'extension writes one immutable history row');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
with combined as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Large custom","category":"other","volume_ml":1000,"abv_percent":10}',
    (select time_value from test_state where key = 'before_extension'),
    '20000000-0000-4000-8000-000000000006',
    false,
    false
  ) value
)
select extensions.ok(
  value -> 'warnings' ? 'plan_exceeded' and value -> 'warnings' ? 'after_end',
  'server combines plan and historical after-end warnings'
) from combined;
with accepted as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Large custom","category":"other","volume_ml":1000,"abv_percent":10}',
    (select time_value from test_state where key = 'before_extension'),
    '20000000-0000-4000-8000-000000000006',
    true,
    true
  ) value
)
select extensions.is(value -> 'log' ->> 'afterEnd', 'true', 'extension never reclassifies an earlier log') from accepted;
select extensions.is((select count(*) from public.night_alerts where type = 'personal_pace'), 1::bigint, 'personal pace alert is deduplicated');
select extensions.is((select count(*) from public.night_alerts where type = 'group_check_in'), 1::bigint, 'group check-in alert is generated');

select extensions.throws_ok(
  format('select public.extend_night(%L::uuid, 30)', (select uuid_value from test_state where key = 'night')),
  '42501',
  'Night not found.',
  'non-host cannot extend the night'
);

with water as (
  select public.log_water(
    (select uuid_value from test_state where key = 'member'),
    clock_timestamp(),
    '30000000-0000-4000-8000-000000000002'
  ) value
)
select extensions.is(value ->> 'status', 'created', 'water logs separately from alcohol') from water;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
with ended as (select public.end_night((select uuid_value from test_state where key = 'night')) value)
select extensions.is(value -> 'night' ->> 'status', 'ended', 'host irreversibly ends the night') from ended;
select public.end_night((select uuid_value from test_state where key = 'night')) is not null;
reset role;
select extensions.is((select count(*) from public.audit_events where action = 'night.ended'), 1::bigint, 'ending is idempotent');
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
with grace as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Queued pre-end","category":"other","volume_ml":40,"abv_percent":10}',
    (select ended_at - interval '1 millisecond' from public.nights where id = (select uuid_value from test_state where key = 'night')),
    '20000000-0000-4000-8000-000000000007',
    true,
    true
  ) value
)
select extensions.is(value ->> 'status', 'created', 'pre-end queue syncs during 24-hour grace') from grace;
with rejected as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"After actual end","category":"other","volume_ml":40,"abv_percent":10}',
    (select ended_at + interval '1 millisecond' from public.nights where id = (select uuid_value from test_state where key = 'night')),
    '20000000-0000-4000-8000-000000000008',
    true,
    true
  ) value
)
select extensions.is(value ->> 'code', 'after_actual_end', 'post-actual-end queue is rejected') from rejected;

reset role;
update public.nights
set starts_at = clock_timestamp() - interval '26 hours',
    initial_ends_at = clock_timestamp() - interval '25 hours 30 minutes',
    ends_at = clock_timestamp() - interval '25 hours',
    ended_at = clock_timestamp() - interval '25 hours'
where id = (select uuid_value from test_state where key = 'night');
update public.night_members
set joined_at = clock_timestamp() - interval '26 hours'
where night_id = (select uuid_value from test_state where key = 'night');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
with expired as (
  select public.log_drink(
    (select uuid_value from test_state where key = 'member'),
    null,
    '{"label":"Expired queue","category":"other","volume_ml":40,"abv_percent":10}',
    (select ended_at - interval '1 minute' from public.nights where id = (select uuid_value from test_state where key = 'night')),
    '20000000-0000-4000-8000-000000000009',
    true,
    true
  ) value
)
select extensions.is(value ->> 'code', 'post_end_grace_expired', 'queue stops after the 24-hour grace') from expired;

reset role;
update public.night_members
set left_at = clock_timestamp()
where id = (select uuid_value from test_state where key = 'member');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.nights), 0::bigint, 'member who left can no longer read the night');

select * from extensions.finish(true);
rollback;
