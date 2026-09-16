begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(22);

select extensions.matches(
  pg_get_constraintdef(oid),
  'ON DELETE SET NULL',
  'audit actor references are cleared when an Auth user is deleted'
)
from pg_constraint
where conrelid = 'public.audit_events'::regclass
  and conname = 'audit_events_actor_user_id_fkey';

select extensions.lives_ok(
  $$
    insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    values (
      '00000000-0000-4000-8000-000000000099',
      'delete-me@example.test',
      '{"display_name":"Delete Me","age_confirmed":true}',
      clock_timestamp(),
      clock_timestamp()
    )
  $$,
  'an otherwise unused Auth user can be created'
);

select extensions.is(
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000099'),
  1::bigint,
  'signup creates the profile that will cascade on deletion'
);

select extensions.is(
  (
    select count(*)
    from public.audit_events
    where actor_user_id = '00000000-0000-4000-8000-000000000099'
      and action = 'profile.created'
  ),
  1::bigint,
  'signup creates an audit row that references the user'
);

select extensions.lives_ok(
  $$delete from auth.users where id = '00000000-0000-4000-8000-000000000099'$$,
  'deleting an unused Auth user is not blocked by its signup audit row'
);

select extensions.is(
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000099'),
  0::bigint,
  'Auth deletion cascades to the profile'
);

select extensions.is(
  (
    select count(*)
    from public.audit_events
    where action = 'profile.created'
      and actor_user_id is null
      and entity_id is null
      and after_data = '{"account_deleted":true}'::jsonb
  ),
  1::bigint,
  'the retained profile audit row contains no account identifier or display name'
);

select extensions.is(
  (
    select count(*)
    from pg_constraint
    where conname in (
      'night_members_user_id_fkey',
      'drink_plan_items_created_by_fkey',
      'drink_logs_actor_user_id_fkey',
      'water_logs_actor_user_id_fkey'
    )
      and confdeltype = 'n'
  ),
  4::bigint,
  'shared-night ownership references use ON DELETE SET NULL'
);

select extensions.lives_ok(
  $$
    insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    values
      (
        '00000000-0000-4000-8000-000000000097',
        'deletion-host@example.test',
        '{"display_name":"Deletion Host","age_confirmed":true}',
        clock_timestamp(),
        clock_timestamp()
      ),
      (
        '00000000-0000-4000-8000-000000000098',
        'deletion-member@example.test',
        '{"display_name":"Deletion Member","age_confirmed":true}',
        clock_timestamp(),
        clock_timestamp()
      );

    insert into public.nights (
      id, host_user_id, creation_key, title, status, starts_at,
      initial_ends_at, ends_at, ended_at, timezone
    ) values (
      '10000000-0000-4000-8000-000000000097',
      '00000000-0000-4000-8000-000000000097',
      '20000000-0000-4000-8000-000000000097',
      'Deletion test night',
      'ended',
      clock_timestamp() - interval '3 hours',
      clock_timestamp() - interval '1 hour',
      clock_timestamp() - interval '1 hour',
      clock_timestamp() - interval '1 hour',
      'Africa/Nairobi'
    );

    insert into public.night_members (
      id, night_id, user_id, display_name, display_name_at_end,
      member_type, role, joined_at
    ) values
      (
        '30000000-0000-4000-8000-000000000097',
        '10000000-0000-4000-8000-000000000097',
        '00000000-0000-4000-8000-000000000097',
        'Deletion Host',
        'Deletion Host',
        'account',
        'host',
        clock_timestamp() - interval '3 hours'
      ),
      (
        '30000000-0000-4000-8000-000000000098',
        '10000000-0000-4000-8000-000000000097',
        '00000000-0000-4000-8000-000000000098',
        'Deletion Member',
        'Deletion Member',
        'account',
        'member',
        clock_timestamp() - interval '2 hours'
      );

    insert into public.drink_plan_items (
      id, night_member_id, label, category, volume_ml, abv_percent,
      planned_quantity, is_quick_log, created_by
    ) values (
      '40000000-0000-4000-8000-000000000098',
      '30000000-0000-4000-8000-000000000098',
      'Test drink',
      'beer',
      330,
      5,
      1,
      true,
      '00000000-0000-4000-8000-000000000098'
    );

    insert into public.drink_logs (
      id, night_id, night_member_id, actor_user_id, plan_item_id,
      label_snapshot, category_snapshot, volume_ml, abv_percent,
      consumed_at, idempotency_key
    ) values (
      '50000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000097',
      '30000000-0000-4000-8000-000000000098',
      '00000000-0000-4000-8000-000000000098',
      '40000000-0000-4000-8000-000000000098',
      'Test drink',
      'beer',
      330,
      5,
      clock_timestamp() - interval '90 minutes',
      '60000000-0000-4000-8000-000000000098'
    );

    insert into public.water_logs (
      id, night_id, night_member_id, actor_user_id, consumed_at, idempotency_key
    ) values (
      '70000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000097',
      '30000000-0000-4000-8000-000000000098',
      '00000000-0000-4000-8000-000000000098',
      clock_timestamp() - interval '80 minutes',
      '80000000-0000-4000-8000-000000000098'
    );

    insert into public.night_alerts (
      id, night_id, night_member_id, type, severity, visibility, message, dedupe_key
    ) values (
      '90000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000097',
      '30000000-0000-4000-8000-000000000098',
      'group_check_in',
      'caution',
      'group',
      'Deletion Member has logged several drinks.',
      'deletion-member-alert'
    );

    insert into public.support_requests (user_id, request_key, kind, message)
    values (
      '00000000-0000-4000-8000-000000000098',
      'a0000000-0000-4000-8000-000000000098',
      'deletion',
      'Please delete this test account.'
    );
  $$,
  'a shared-night participant deletion fixture can be created'
);

select extensions.lives_ok(
  $$delete from auth.users where id = '00000000-0000-4000-8000-000000000098'$$,
  'a non-host participant can be deleted without deleting shared history'
);

select extensions.ok(
  not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000098')
  and not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000098'),
  'the participant Auth user and profile are deleted'
);

select extensions.is(
  (
    select count(*)
    from public.night_members
    where id = '30000000-0000-4000-8000-000000000098'
      and user_id is null
      and display_name = 'Deleted user'
      and display_name_at_end = 'Deleted user'
      and left_at is not null
  ),
  1::bigint,
  'the shared membership is retained as a former deleted user'
);

select extensions.is(
  (
    select count(*)
    from public.drink_plan_items
    where id = '40000000-0000-4000-8000-000000000098' and created_by is null
  ),
  1::bigint,
  'the plan is retained without its account creator reference'
);

select extensions.is(
  (
    select count(*)
    from public.drink_logs
    where id = '50000000-0000-4000-8000-000000000098' and actor_user_id is null
  ),
  1::bigint,
  'the drink log is retained without its account actor reference'
);

select extensions.is(
  (
    select count(*)
    from public.water_logs
    where id = '70000000-0000-4000-8000-000000000098' and actor_user_id is null
  ),
  1::bigint,
  'the water log is retained without its account actor reference'
);

select extensions.ok(
  not exists (
    select 1 from public.night_alerts
    where night_member_id = '30000000-0000-4000-8000-000000000098'
      and message like '%Deletion Member%'
  ),
  'shared alert text no longer contains the deleted display name'
);

select extensions.ok(
  not exists (
    select 1 from public.notification_events
    where (target_member_id = '30000000-0000-4000-8000-000000000098'
      or sender_user_id = '00000000-0000-4000-8000-000000000098')
      and (title like '%Deletion Member%' or body like '%Deletion Member%')
  ),
  'retained notification text no longer contains the deleted display name'
);

select extensions.is(
  (
    select count(*) from public.support_requests
    where user_id = '00000000-0000-4000-8000-000000000098'
  ),
  0::bigint,
  'private support requests are removed with the deleted profile'
);

select extensions.is(
  (
    select count(*)
    from public.audit_events
    where action = 'profile.created'
      and actor_user_id is null
      and entity_id is null
      and after_data = '{"account_deleted":true}'::jsonb
  ),
  2::bigint,
  'deleted profile audit entries retain only the deletion marker'
);

select extensions.ok(
  exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000097')
  and exists (select 1 from public.nights where id = '10000000-0000-4000-8000-000000000097'),
  'the host account and shared night remain intact'
);

select extensions.throws_ok(
  $$delete from auth.users where id = '00000000-0000-4000-8000-000000000097'$$,
  '23503',
  null,
  'host deletion remains blocked pending shared-night ownership review'
);

select extensions.ok(
  exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000097')
  and exists (select 1 from public.nights where id = '10000000-0000-4000-8000-000000000097'),
  'a failed host deletion leaves the host and night unchanged'
);

select * from extensions.finish(true);
rollback;
