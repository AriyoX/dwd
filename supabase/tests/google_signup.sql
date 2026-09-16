begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(13);
-- The standalone Postgres image has the pre-GoTrue auth schema. Match the
-- column added by GoTrue migrations in a running Supabase stack.
alter table auth.users add column if not exists email_confirmed_at timestamptz;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values ('00000000-0000-4000-8000-000000000091', 'google@example.test', '{"provider":"google"}', '{"full_name":"Google Person"}', now());
select extensions.is((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000091'), 0::bigint, 'Google identity waits for adult confirmation');
select extensions.throws_ok($$insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), '{"display_name":"Spoof","provider":"google"}')$$, '22023', 'Adult confirmation is required.', 'user metadata cannot bypass email signup validation');
select extensions.throws_ok($$select private.complete_signup('Person', true)$$, '42501', 'Authentication required.', 'onboarding requires identity even at private boundary');
set local role anon;
select extensions.throws_ok($$select public.complete_signup('Person', true)$$, '42501', null, 'anonymous onboarding is denied');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000091', true);
set local role authenticated;
select extensions.throws_ok($$select public.complete_signup('Person', false)$$, '22023', 'Adult confirmation is required.', 'adult confirmation cannot be skipped');
select extensions.throws_ok($$select public.complete_signup('Person', null)$$, '22023', 'Adult confirmation is required.', 'null is not adult confirmation');
select extensions.throws_ok($$select public.complete_signup(' ', true)$$, '22023', 'A valid display name is required.', 'empty names are rejected');
select extensions.throws_ok($$select public.start_night_out(gen_random_uuid(), 'Premature night', clock_timestamp()+interval '2 hours', 'Africa/Nairobi', '[]', '[]')$$, '22023', null, 'profile-less Google accounts cannot start nights');
select extensions.lives_ok($$select public.complete_signup(' Google Person ', true)$$, 'Google profile can be completed');
select extensions.is((select display_name from public.profiles where id = auth.uid()), 'Google Person', 'only the caller profile is created with a trimmed name');
select public.complete_signup('Changed on retry', true);
select extensions.is((select display_name from public.profiles where id = auth.uid()), 'Google Person', 'retry does not overwrite an existing profile');
reset role;
select extensions.is((select count(*) from public.audit_events where actor_user_id = '00000000-0000-4000-8000-000000000091' and action = 'profile.created'), 1::bigint, 'onboarding creates one audit event across retries');
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-000000000091';
set local role authenticated;
select extensions.throws_ok($$select public.complete_signup('Person', true)$$, '42501', 'A verified email is required.', 'unverified email cannot complete onboarding');
reset role;
select * from extensions.finish();
rollback;
