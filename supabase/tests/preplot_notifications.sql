begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(47);

select extensions.is((select send_time::text from private.preplot_windows('2026-10-16') where not backup), '17:15:00', 'Friday primary is 5:15 PM Kampala time');
select extensions.is((select send_time::text from private.preplot_windows('2026-10-17') where not backup), '15:30:00', 'Saturday primary is 3:30 PM');
select extensions.is((select campaign from private.preplot_windows('2026-10-08')), 'independence_eve', 'Independence eve overrides regular scheduling');
select extensions.is((select count(*) from private.preplot_windows('2026-10-09')), 1::bigint, 'holiday Friday produces one campaign instead of overlapping weekend pushes');
select extensions.is((select campaign from private.preplot_windows('2026-12-25')), 'christmas_holiday', 'Christmas takes precedence over Boxing Day eve');
select extensions.is((select count(*) from private.preplot_windows('2026-12-31')), 2::bigint, 'New Year eve has two opportunities');
select extensions.is((select count(*) from private.preplot_windows('2026-04-03')), 0::bigint, 'Good Friday suppresses Friday campaigns');
select extensions.is((select count(*) from private.preplot_windows('2026-03-20')), 0::bigint, 'Eid suppresses Friday campaigns');
select extensions.is((select count(*) from private.preplot_windows('2026-06-02')), 0::bigint, 'Martyrs Day eve is suppressed');
select extensions.is((select count(*) from private.preplot_windows('2027-01-02')), 2::bigint, 'weekend campaigns continue into the next year');
select extensions.is((select campaign from private.preplot_windows('2027-01-01')), 'new_year_holiday', 'New Year Day follows the countdown campaign');
select extensions.ok(not has_function_privilege('authenticated', 'private.create_due_preplot_events(timestamptz)', 'EXECUTE'), 'accounts cannot schedule campaigns');
select extensions.ok(not has_function_privilege('authenticated', 'public.recheck_native_notification_job(uuid,integer)', 'EXECUTE'), 'accounts cannot recheck worker jobs');
select extensions.ok(not has_function_privilege('anon', 'public.record_preplot_open(uuid)', 'EXECUTE'), 'anonymous users cannot track opens');
select extensions.is((select count(*) from pg_tables where schemaname='private' and tablename like 'preplot_%' and rowsecurity), 6::bigint, 'all private campaign tables have RLS');

insert into auth.users(id,email,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','preplot@example.test','{"display_name":"Plot","age_confirmed":true}'),
 ('91000000-0000-4000-8000-000000000002','preplot-other@example.test','{"display_name":"Other","age_confirmed":true}');
insert into auth.sessions(id,user_id) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select public.register_native_push('93000000-0000-4000-8000-000000000001','ExpoPushToken[preplot]','ios');
select public.update_native_push_context('93000000-0000-4000-8000-000000000001','Africa/Kampala');
select extensions.is(public.get_preplot_preferences()->>'sundayEnabled', 'false', 'Sunday reminders default off');
select extensions.throws_ok($$select public.update_native_push_context('93000000-0000-4000-8000-000000000001','Invalid/Timezone')$$,'22023','Invalid timezone.','device context rejects invalid timezone');
reset role;
select extensions.is((select count(*) from private.preplot_app_sessions),1::bigint,'foreground context records an app session bucket');
select extensions.is(private.create_due_preplot_events('2026-10-16T14:14:00Z'),0,'no campaign before its local window');
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),1,'UTC tick creates the Kampala Friday campaign');
select extensions.is(private.create_due_preplot_events('2026-10-16T14:16:00Z'),0,'repeated Cron tick does not create a duplicate');
select extensions.is(private.create_due_preplot_events('2026-10-16T16:30:00Z'),0,'backup requires an accepted primary');
update private.preplot_campaigns set accepted_at='2026-10-16T14:15:00Z';
select extensions.is(private.create_due_preplot_events('2026-10-16T16:30:00Z'),1,'unopened primary permits the evening backup');
select extensions.is(private.create_due_preplot_events('2026-10-17T12:30:00Z'),0,'two campaign cap applies across the weekend');
delete from public.notification_events where recipient_user_id='91000000-0000-4000-8000-000000000001';
select private.create_due_preplot_events('2026-10-16T14:15:00Z');
update private.preplot_campaigns set accepted_at='2026-10-16T14:15:00Z',opened_at='2026-10-16T14:16:00Z';
select extensions.is(private.create_due_preplot_events('2026-10-17T12:30:00Z'),0,'opening the first reminder suppresses the second');
delete from public.notification_events where recipient_user_id='91000000-0000-4000-8000-000000000001';
select extensions.is(private.create_due_preplot_events('2026-10-18T13:00:00Z'),0,'Sunday sends require separate opt-in');
set local role authenticated;
select public.update_preplot_preferences(true,true);
reset role;
select extensions.is(private.create_due_preplot_events('2026-10-18T13:00:00Z'),1,'Sunday opt-in enables its afternoon window');
delete from public.notification_events where recipient_user_id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.update_preplot_preferences(false,true);
reset role;
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),0,'preplot opt-out suppresses scheduling');
set local role authenticated;
select public.update_preplot_preferences(true,false);
reset role;
update public.native_push_subscriptions set timezone='Europe/London';
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),0,'out-of-target timezone suppresses campaigns');
update public.native_push_subscriptions set timezone='Africa/Kampala';
update private.preplot_preferences set quiet_start='16:00',quiet_end='18:00';
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),0,'same-day quiet hours suppress campaigns');
update private.preplot_preferences set quiet_start='22:00',quiet_end='08:00';
select extensions.ok(not private.preplot_user_eligible('91000000-0000-4000-8000-000000000001','2026-10-16T20:00:00Z'),'overnight quiet hours are handled');
delete from auth.sessions where user_id='91000000-0000-4000-8000-000000000001';
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),0,'revoked sessions suppress campaigns');
insert into auth.sessions(id,user_id) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');

-- A live-window fixture verifies the worker recheck and trigger cancellation
-- without relying on the wall clock being Friday afternoon.
insert into public.notification_events(id,event_key,recipient_user_id,category,event_type,title,body,deep_link,expires_at)
values('94000000-0000-4000-8000-000000000001','preplot-live','91000000-0000-4000-8000-000000000001','preplot','preplot','What''s the plot? 👀','Start your Night before heading out.','/night/new',clock_timestamp()+interval '1 hour');
insert into private.preplot_campaigns(event_id,user_id,campaign,local_day,starts_at,expires_at)
values('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','friday_preplot',(clock_timestamp() at time zone 'Africa/Kampala')::date,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
insert into public.native_notification_deliveries(id,event_id,subscription_id,status,attempts)
select '95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',id,'queued',0 from public.native_push_subscriptions;
create temporary table preplot_jobs(value jsonb);
grant all on preplot_jobs to service_role;
-- Override quiet hours for this clock-independent transport fixture only.
update private.preplot_preferences set quiet_start='00:00',quiet_end='00:00:01';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
set local role service_role;
insert into preplot_jobs values(public.claim_native_notification_jobs());
select extensions.is((select jsonb_array_length(value) from preplot_jobs),1,'native worker claims a pre-plot delivery');
select extensions.is((select value->0->>'title' from preplot_jobs),'What''s the plot? 👀','native pre-plot jobs carry campaign copy');
select extensions.is((select value->0->>'preplot' from preplot_jobs),'true','only pre-plot jobs opt into public campaign copy');
select extensions.ok(public.recheck_native_notification_job('95000000-0000-4000-8000-000000000001',1),'current campaign passes final worker recheck');
select public.complete_native_notification_job('95000000-0000-4000-8000-000000000001',1,'preplot-receipt');
select public.complete_native_push_receipt('95000000-0000-4000-8000-000000000001',false,true);
reset role;
select extensions.ok((select accepted_at is not null and delivered_at is not null from private.preplot_campaigns where event_id='94000000-0000-4000-8000-000000000001'),'Expo acceptance and receipt delivery are tracked separately');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.acknowledge_notification('94000000-0000-4000-8000-000000000001');
reset role;
select extensions.ok((select opened_at is null from private.preplot_campaigns where event_id='94000000-0000-4000-8000-000000000001'),'mark read does not pretend the push was opened');
set local role authenticated;
select public.record_preplot_open('94000000-0000-4000-8000-000000000001');
select public.record_preplot_open('94000000-0000-4000-8000-000000000001');
reset role;
select extensions.ok((select opened_at is not null from private.preplot_campaigns where event_id='94000000-0000-4000-8000-000000000001'),'an actual open is recorded idempotently');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.is(public.get_my_notification_event('94000000-0000-4000-8000-000000000001'),null::jsonb,'another account cannot resolve a push event');
select extensions.throws_ok($$select public.record_preplot_open('94000000-0000-4000-8000-000000000001')$$,'42501','Notification not found.','another account cannot spoof a push open');
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
-- Expired messages can still be tapped later and resolve to Night setup.
update public.notification_events set expires_at=created_at+interval '1 microsecond' where id='94000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(public.get_my_notification_event('94000000-0000-4000-8000-000000000001')->>'eventType','preplot','expired push taps still resolve by owned event ID');
reset role;
update public.notification_events set expires_at=clock_timestamp()+interval '1 hour',acknowledged_at=null where id='94000000-0000-4000-8000-000000000001';
update public.native_notification_deliveries set status='queued';
set local role authenticated;
select public.start_night_out_recoverable('96000000-0000-4000-8000-000000000001','Plot test',clock_timestamp()+interval '2 hours','Africa/Kampala','[]','[]');
reset role;
select extensions.ok((select night_started_at is not null and attributed_night_id is not null and suppressed_at is not null from private.preplot_campaigns where event_id='94000000-0000-4000-8000-000000000001'),'starting a Night attributes conversion and suppresses the campaign');
select extensions.is((select status from public.native_notification_deliveries where id='95000000-0000-4000-8000-000000000001'),'discarded','starting a Night cancels pending native deliveries');
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select extensions.ok(not public.recheck_native_notification_job('95000000-0000-4000-8000-000000000001',1),'a cancelled claim fails the final send check');
reset role;
select extensions.is(private.create_due_preplot_events('2026-10-16T14:15:00Z'),0,'active Night blocks new campaigns');
update public.nights set status='ended',ended_at=clock_timestamp() where host_user_id='91000000-0000-4000-8000-000000000001';
select extensions.ok(not private.preplot_user_eligible('91000000-0000-4000-8000-000000000001',clock_timestamp()),'a recently ended Night still suppresses reminders');
select * from extensions.finish();
rollback;
