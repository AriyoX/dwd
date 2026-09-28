begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(32);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.night_photos'::regclass),
  'night photos use RLS'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.night_photos', 'INSERT')
    and not has_table_privilege('authenticated', 'public.night_photos', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.night_photos', 'DELETE'),
  'photo metadata cannot bypass its RPCs'
);
select extensions.ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'night_photos'
  ),
  'photo changes are available to authorized realtime subscribers'
);

insert into auth.users(id, email, raw_user_meta_data) values
  ('61000000-0000-4000-8000-000000000001', 'product-host@example.test', '{"display_name":"Product Host","age_confirmed":true}'),
  ('61000000-0000-4000-8000-000000000002', 'product-member@example.test', '{"display_name":"Product Member","age_confirmed":true}'),
  ('61000000-0000-4000-8000-000000000003', 'product-outsider@example.test', '{"display_name":"Product Outsider","age_confirmed":true}'),
  ('61000000-0000-4000-8000-000000000004', 'reminder-member@example.test', '{"display_name":"Reminder Member","age_confirmed":true}');

create temporary table product_state(key text primary key, value uuid);
grant all on product_state to authenticated;

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

with started as (
  select public.start_night_out(
    '62000000-0000-4000-8000-000000000001', 'Product update night',
    clock_timestamp() + interval '3 hours', 'Africa/Nairobi',
    '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":4,"isQuickLog":true}]',
    '[]'
  ) value
)
insert into product_state values ('night', (select (value->>'nightId')::uuid from started));
insert into product_state
select 'host_member', id from public.night_members where user_id = auth.uid();

with invite as (
  select public.create_night_invite(
    (select value from product_state where key = 'night'), repeat('b', 64),
    clock_timestamp() + interval '2 hours', 4
  ) value
)
select extensions.ok((value->>'inviteId') is not null, 'host can invite an account participant mid-night') from invite;

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select public.redeem_night_invite(repeat('b', 64)) is not null;
insert into product_state
select 'member', id from public.night_members
where night_id = (select value from product_state where key = 'night') and user_id = auth.uid();
select public.replace_member_plan_v2(
  (select value from product_state where key = 'member'),
  '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":4,"isQuickLog":true}]',
  0
) is not null;

with logged as (
  select public.log_drink(
    (select value from product_state where key = 'member'),
    (select id from public.drink_plan_items where night_member_id = (select value from product_state where key = 'member') and archived_at is null),
    null, clock_timestamp(), '63000000-0000-4000-8000-000000000001', false, false
  ) value
)
select extensions.is(value->>'status', 'created', 'account participant logs exactly one drink') from logged;
select extensions.is(
  (public.log_water(
    (select value from product_state where key = 'member'), clock_timestamp(),
    '63000000-0000-4000-8000-000000000002'
  )->>'status'),
  'created', 'one drink plus one chaser is recorded'
);
select extensions.ok(
  public.get_night_snapshot((select value from product_state where key = 'night')) is not null,
  'refresh returns the one-drink state before adjustment'
);
insert into product_state
select 'one_drink_plan', plan_item_id from public.drink_logs
where night_member_id = (select value from product_state where key = 'member') and deleted_at is null;
select extensions.lives_ok(
  format(
    'select public.replace_member_plan_v2(%L::uuid, %L::jsonb, %L::integer)',
    (select value from product_state where key = 'member'),
    '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":6,"isQuickLog":true}]',
    (select plan_revision from public.night_members where id = (select value from product_state where key = 'member'))
  ),
  'exactly one logged drink can adjust a plan upward after refresh'
);
select extensions.is(
  (select count(*) from public.drink_logs where night_member_id = (select value from product_state where key = 'member') and deleted_at is null),
  1::bigint, 'one-drink adjustment does not rewrite history'
);
select extensions.ok(
  (select archived_at is not null from public.drink_plan_items where id = (select value from product_state where key = 'one_drink_plan')),
  'the plan version referenced by the historical drink is archived'
);
select extensions.is(
  (select planned_quantity from public.drink_plan_items where night_member_id = (select value from product_state where key = 'member') and archived_at is null),
  6, 'the future plan uses the adjusted quantity'
);

reset role;
update public.nights set starts_at = clock_timestamp() - interval '1 hour'
where id = (select value from product_state where key = 'night');
update public.night_members set joined_at = clock_timestamp() - interval '1 hour'
where id = (select value from product_state where key = 'member');
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);

with caught_up as (
  select public.log_drink(
    (select value from product_state where key = 'member'),
    null, '{"label":"Beer","category":"beer","volume_ml":330,"abv_percent":5}',
    (select min(created_at) + interval '1 millisecond' from public.drink_plan_items where night_member_id = (select value from product_state where key = 'member')),
    '63000000-0000-4000-8000-000000000003', false, false
  ) value
)
select extensions.is(value->>'status', 'created', 'catch-up stores a retrospectively timed drink') from caught_up;
select extensions.ok(
  (select consumed_at < created_at from public.drink_logs where idempotency_key = '63000000-0000-4000-8000-000000000003'),
  'catch-up preserves activity time separately from entry time'
);
select extensions.lives_ok(
  format(
    'select public.replace_member_plan_v2(%L::uuid, %L::jsonb, %L::integer)',
    (select value from product_state where key = 'member'),
    '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":2,"isQuickLog":true}]',
    (select plan_revision from public.night_members where id = (select value from product_state where key = 'member'))
  ),
  'a plan can be reduced while still covering two recorded drinks'
);
select extensions.throws_ok(
  format(
    'select public.replace_member_plan_v2(%L::uuid, %L::jsonb, %L::integer)',
    (select value from product_state where key = 'member'),
    '[{"label":"Beer","category":"beer","volumeMl":330,"abvPercent":5,"plannedQuantity":1,"isQuickLog":true}]',
    (select plan_revision from public.night_members where id = (select value from product_state where key = 'member'))
  ),
  '22023', 'Adjusted plan cannot be below activity already logged.',
  'a plan cannot be reduced below recorded activity'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select extensions.ok(
  public.add_managed_guest_v2(
    (select value from product_state where key = 'night'), 'Late Guest',
    '[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":1,"isQuickLog":true}]',
    '64000000-0000-4000-8000-000000000001'
  ) is not null,
  'host adds a managed guest after the night starts'
);
select public.add_managed_guest_v2(
  (select value from product_state where key = 'night'), 'Ignored retry', '[]',
  '64000000-0000-4000-8000-000000000001'
) is not null;
select extensions.is(
  (select count(*) from public.night_members where night_id = (select value from product_state where key = 'night') and participant_key = '64000000-0000-4000-8000-000000000001'),
  1::bigint, 'mid-night guest retry is idempotent'
);
insert into product_state
select 'guest', id from public.night_members where participant_key = '64000000-0000-4000-8000-000000000001';
select extensions.ok(
  (select joined_at > starts_at from public.night_members m join public.nights n on n.id = m.night_id where m.id = (select value from product_state where key = 'guest')),
  'late participation begins at the real join time'
);
select extensions.is(
  (public.log_drink(
    (select value from product_state where key = 'guest'),
    (select id from public.drink_plan_items where night_member_id = (select value from product_state where key = 'guest') and archived_at is null),
    null, clock_timestamp(), '63000000-0000-4000-8000-000000000004', false, false
  )->>'status'),
  'created', 'host can immediately log for the new managed guest'
);
select extensions.lives_ok(
  format(
    'select public.replace_member_plan_v2(%L::uuid, %L::jsonb, %L::integer)',
    (select value from product_state where key = 'guest'),
    '[{"label":"Wine","category":"wine","volumeMl":150,"abvPercent":12,"plannedQuantity":2,"isQuickLog":true}]',
    (select plan_revision from public.night_members where id = (select value from product_state where key = 'guest'))
  ),
  'managed guest plan can be adjusted after one logged drink'
);

select public.create_night_invite(
  (select value from product_state where key = 'night'), repeat('c', 64),
  clock_timestamp() + interval '2 hours', 4
) is not null;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000004', true);
select public.redeem_night_invite(repeat('c', 64)) is not null;
select public.update_notification_preferences(true, true, false, false, true, 15) is not null;
select public.update_notification_preferences(true, true, false, false, true, 15) is not null;
reset role;
select extensions.is(
  (select count(*) from public.notification_schedules where user_id = '61000000-0000-4000-8000-000000000004' and kind = 'periodic_water'),
  1::bigint, 'reminder registration is idempotent'
);
update public.notification_schedules set next_due_at = clock_timestamp() - interval '1 minute'
where user_id = '61000000-0000-4000-8000-000000000004' and kind = 'periodic_water';
select private.process_due_notification_events('61000000-0000-4000-8000-000000000004');
select private.process_due_notification_events('61000000-0000-4000-8000-000000000004');
select extensions.is(
  (select count(*) from public.notification_events where recipient_user_id = '61000000-0000-4000-8000-000000000004' and event_type = 'periodic_water'),
  1::bigint, 'due reminder processing prevents duplicates'
);
select extensions.is(
  (select deep_link from public.notification_events where recipient_user_id = '61000000-0000-4000-8000-000000000004' and event_type = 'periodic_water'),
  '/night/' || (select value::text from product_state where key = 'night') || '?fast=drink',
  'reminder deep-links to the active logging view'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  format(
    'select public.register_night_photo(%L::uuid, %L::uuid, %L, %L, 1200, 800, 600)',
    '65000000-0000-4000-8000-000000000001',
    (select value from product_state where key = 'night'),
    (select value::text from product_state where key = 'night') || '/61000000-0000-4000-8000-000000000001/65000000-0000-4000-8000-000000000001.jpg',
    'image/jpeg'
  ),
  '42501', 'Night not found.', 'photo metadata cannot be registered before the night ends'
);
select public.end_night((select value from product_state where key = 'night')) is not null;
reset role;
select extensions.is(
  (select count(*) from public.notification_schedules where night_id = (select value from product_state where key = 'night')),
  0::bigint, 'ending the night removes all reminder schedules'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  format(
    'select public.replace_member_plan_v2(%L::uuid, %L::jsonb, null)',
    (select value from product_state where key = 'host_member'), '[]'
  ),
  '55000', 'Ended nights are read-only.',
  'ending remains irreversible for plan and logging state'
);

reset role;
insert into public.night_photos (
  id, night_id, uploaded_by_user_id, uploader_name, object_path,
  mime_type, byte_size, width, height
) values (
  '65000000-0000-4000-8000-000000000001',
  (select value from product_state where key = 'night'),
  '61000000-0000-4000-8000-000000000001', 'Product Host',
  (select value::text from product_state where key = 'night') || '/61000000-0000-4000-8000-000000000001/65000000-0000-4000-8000-000000000001.jpg',
  'image/jpeg', 1200, 800, 600
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.night_photos), 1::bigint, 'completed-night photo is visible to its uploader');

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.night_photos), 1::bigint, 'another authorized participant can view the memory');
select extensions.throws_ok(
  $$select public.delete_night_photo('65000000-0000-4000-8000-000000000001')$$,
  '42501', 'Photo not found.', 'another participant cannot delete the uploader photo'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.night_photos), 0::bigint, 'an outsider cannot view night photos');
select extensions.throws_ok(
  format('select public.get_night_photos(%L::uuid)', (select value from product_state where key = 'night')),
  '42501', 'Night not found.', 'an outsider cannot obtain signed-photo metadata'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select public.delete_night_photo('65000000-0000-4000-8000-000000000001') is not null;
select extensions.is((select count(*) from public.night_photos), 0::bigint, 'the uploader can delete their own photo metadata');

select * from extensions.finish(true);
rollback;
