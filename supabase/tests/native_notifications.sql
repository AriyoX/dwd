begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(29);
insert into auth.users(id, email, raw_user_meta_data) values
 ('81000000-0000-4000-8000-000000000001', 'native-one@example.test', '{"display_name":"One","age_confirmed":true}'),
 ('81000000-0000-4000-8000-000000000002', 'native-two@example.test', '{"display_name":"Two","age_confirmed":true}');
insert into auth.sessions(id, user_id) values
 ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001'),
 ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002');
create temporary table native_state(key text primary key, value jsonb);
grant all on native_state to authenticated, service_role;
select extensions.is((select count(*) from pg_tables where schemaname = 'public' and tablename in ('native_push_subscriptions', 'native_notification_deliveries') and rowsecurity), 2::bigint, 'native tables enable RLS');
select extensions.ok(not has_function_privilege('authenticated', 'public.claim_native_notification_jobs(integer)', 'EXECUTE'), 'accounts cannot claim deliveries');
select extensions.ok(not has_function_privilege('anon', 'public.register_native_push(uuid,text,text)', 'EXECUTE'), 'anonymous clients cannot register devices');
select extensions.ok(not has_table_privilege('authenticated', 'public.native_push_subscriptions', 'SELECT'), 'device tokens are not readable through the account API');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","session_id":"82000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select extensions.is(public.register_native_push('83000000-0000-4000-8000-000000000001', 'ExpoPushToken[first]', 'ios')->>'registered', 'true', 'signed-in actor can register a device');
select public.register_native_push('83000000-0000-4000-8000-000000000001', 'ExpoPushToken[first]', 'ios');
reset role;
select extensions.is((select count(*) from public.native_push_subscriptions), 1::bigint, 'repeat registration does not duplicate devices');
set local role authenticated;
select extensions.throws_ok($$select public.register_native_push('83000000-0000-4000-8000-000000000009', 'https://evil.test', 'ios')$$, '23514', null, 'token registration rejects arbitrary endpoints');
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","session_id":"82000000-0000-4000-8000-000000000099"}', true);
select extensions.throws_ok($$select public.register_native_push('83000000-0000-4000-8000-000000000009', 'ExpoPushToken[other]', 'ios')$$, '42501', 'Active sign-in required.', 'revoked sessions cannot register devices');
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","session_id":"82000000-0000-4000-8000-000000000001"}', true);
select public.register_native_push('83000000-0000-4000-8000-000000000002', 'ExpoPushToken[second]', 'android');
insert into native_state values ('night', public.start_night_out_recoverable('84000000-0000-4000-8000-000000000001', 'Native night', clock_timestamp() + interval '1 hour', 'UTC', '[]', '[]'));
reset role;
insert into public.notification_events(event_key, recipient_user_id, category, event_type, title, body, deep_link)
 values('native-fixture', '81000000-0000-4000-8000-000000000001', 'direct_checkin', 'direct_checkin', 'Private check-in', 'Private message', '/notifications');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
set local role service_role;
insert into native_state values ('jobs', public.claim_native_notification_jobs(10));
select extensions.is(jsonb_array_length((select value from native_state where key = 'jobs')), 2, 'worker claims one delivery for each device');
select extensions.is(jsonb_array_length(public.claim_native_notification_jobs(10)), 0, 'leased deliveries are not claimed twice');
select extensions.ok(not ((select value->0 from native_state where key = 'jobs') ? 'body'), 'private message details stay off native push payloads');
select extensions.is(public.complete_native_notification_job(((select value->0->>'deliveryId' from native_state where key='jobs'))::uuid, 99, 'late')->>'updated', 'false', 'late attempt cannot overwrite a lease');
select extensions.is(public.complete_native_notification_job(((select value->0->>'deliveryId' from native_state where key='jobs'))::uuid, 1, 'expo-ticket')->>'updated', 'true', 'Expo ticket acceptance is recorded');
reset role;
select extensions.is((select status from public.native_notification_deliveries where id = ((select value->0->>'deliveryId' from native_state where key='jobs'))::uuid), 'accepted', 'ticket acceptance is distinct from device-service delivery');
update public.native_notification_deliveries set status='accepted', receipt_id='missing-ticket', next_attempt_at=clock_timestamp()-interval '25 hours'
 where id = ((select value->1->>'deliveryId' from native_state where key='jobs'))::uuid;
set local role service_role;
select public.get_native_push_receipts();
reset role;
select extensions.is((select status from public.native_notification_deliveries where id = ((select value->1->>'deliveryId' from native_state where key='jobs'))::uuid), 'discarded', 'missing receipts expire rather than polling indefinitely');
set local role service_role;
select public.complete_native_push_receipt(((select value->1->>'deliveryId' from native_state where key='jobs'))::uuid, true, false);
reset role;
select extensions.is((select count(*) from public.native_push_subscriptions where disabled_at is not null), 0::bigint, 'an expired receipt cannot disable an active device');
set local role service_role;
select public.complete_native_push_receipt(((select value->0->>'deliveryId' from native_state where key='jobs'))::uuid, true, false);
reset role;
select extensions.ok(exists(select 1 from public.native_push_subscriptions where disabled_at is not null), 'DeviceNotRegistered receipt disables the stale token');
update public.native_push_subscriptions set disabled_at = null;
set local role service_role;
select public.complete_native_push_receipt(((select value->0->>'deliveryId' from native_state where key='jobs'))::uuid, true, false);
reset role;
select extensions.is((select count(*) from public.native_push_subscriptions where disabled_at is not null), 0::bigint, 'a repeated receipt cannot disable a device that was re-enabled');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","session_id":"82000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select public.register_native_push('83000000-0000-4000-8000-000000000001', 'ExpoPushToken[rotated]', 'ios');
select public.update_notification_preferences(true, false, false, false, true, 60);
reset role;
select extensions.is((select token from public.native_push_subscriptions where installation_id='83000000-0000-4000-8000-000000000001'), 'ExpoPushToken[rotated]', 'device token rotation replaces the old token');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_native_notification_jobs(10)), 0, 'current preferences suppress already queued check-ins');
reset role;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","session_id":"82000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select public.update_notification_preferences(true, false, false, false, true, 60);
reset role;
insert into public.notification_events(event_key, recipient_user_id, night_id, category, event_type, title, body, deep_link)
 values('native-periodic-fixture', '81000000-0000-4000-8000-000000000001', ((select value->>'nightId' from native_state where key='night'))::uuid,
 'personal_reminder', 'periodic_water', 'Private reminder', 'Private details', '/notifications');
select extensions.ok((select private.native_notification_current(e, s) from public.notification_events e cross join public.native_push_subscriptions s
 where e.event_key='native-periodic-fixture' and s.installation_id='83000000-0000-4000-8000-000000000001'), 'an enabled periodic reminder is eligible before pause');
set local role authenticated;
select public.set_reminder_pause(60);
reset role;
select extensions.ok(not (select private.native_notification_current(e, s) from public.notification_events e cross join public.native_push_subscriptions s
 where e.event_key='native-periodic-fixture' and s.installation_id='83000000-0000-4000-8000-000000000001'), 'pausing reminders suppresses existing native jobs');
set local role authenticated;
select public.set_reminder_pause(null);
select public.schedule_account_deletion();
reset role;
select extensions.ok(not (select private.native_notification_current(e, s) from public.notification_events e cross join public.native_push_subscriptions s
 where e.event_key='native-periodic-fixture' and s.installation_id='83000000-0000-4000-8000-000000000001'), 'scheduled account deletion suppresses native delivery');
set local role authenticated;
select public.cancel_account_deletion();
select public.end_night(((select value->>'nightId' from native_state where key='night'))::uuid);
reset role;
select extensions.ok(not (select private.native_notification_current(e, s) from public.notification_events e cross join public.native_push_subscriptions s
 where e.event_key='native-periodic-fixture' and s.installation_id='83000000-0000-4000-8000-000000000001'), 'an ended night cannot send stale native reminders');
delete from auth.sessions where user_id='81000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
set local role service_role;
select extensions.is(jsonb_array_length(public.claim_native_notification_jobs(10)), 0, 'signed-out sessions cannot receive deliveries');
reset role;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","session_id":"82000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select public.register_native_push('83000000-0000-4000-8000-000000000001', 'ExpoPushToken[rotated]', 'ios');
reset role;
select extensions.is((select user_id::text from public.native_push_subscriptions where installation_id='83000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000002', 'switching account transfers this installation without retaining old deliveries');
set local role authenticated;
select public.remove_native_push('83000000-0000-4000-8000-000000000002');
reset role;
select extensions.ok(exists(select 1 from public.native_push_subscriptions where installation_id='83000000-0000-4000-8000-000000000002'), 'an account cannot unregister another account’s installation');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(public.start_night_out_recoverable('84000000-0000-4000-8000-000000000001', 'Native night', clock_timestamp() - interval '1 hour', 'UTC', '[]', '[]')->>'nightId', (select value->>'nightId' from native_state where key='night'), 'recovery returns the same saved night after the planned end expires');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select public.start_night_out_recoverable('84000000-0000-4000-8000-000000000001', 'Native night', clock_timestamp() - interval '1 hour', 'UTC', '[]', '[]')$$, '22023', 'Planned end must be later and within 24 hours.', 'another account cannot recover a night through its creation key');
select * from extensions.finish();
rollback;
