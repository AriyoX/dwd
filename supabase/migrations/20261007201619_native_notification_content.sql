-- Deliver the same event-specific content shown in the inbox to native devices.
create or replace function public.claim_native_notification_jobs(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job record; v_result jsonb := '[]';
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  perform private.create_due_notification_events();
  perform private.create_due_preplot_events();
  update public.native_notification_deliveries d set status = 'discarded'
    from public.notification_events e, public.native_push_subscriptions s
    where d.event_id = e.id and d.subscription_id = s.id and e.event_type = 'preplot'
      and d.status in ('queued', 'failed', 'sending') and not private.native_notification_current(e, s);
  insert into public.native_notification_deliveries(event_id, subscription_id)
  select e.id, s.id from public.notification_events e join public.native_push_subscriptions s on s.user_id = e.recipient_user_id
  where e.created_at > clock_timestamp() - interval '24 hours'
    and e.acknowledged_at is null and private.native_notification_current(e, s) on conflict do nothing;
  for v_job in select d.id, d.attempts + 1 as attempt, s.token, e.id as event_id, e.recipient_user_id, e.night_id,
      e.event_type, e.title, e.body, e.expires_at
    from public.native_notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    join public.native_push_subscriptions s on s.id = d.subscription_id
    where d.status in ('queued', 'failed', 'sending') and d.attempts < 5 and d.next_attempt_at <= clock_timestamp()
      and private.native_notification_current(e, s)
    order by d.next_attempt_at, d.id limit least(greatest(p_limit, 1), 100) for update of d skip locked
  loop
    update public.native_notification_deliveries set status = 'sending', attempts = v_job.attempt,
      next_attempt_at = clock_timestamp() + interval '2 minutes' where id = v_job.id;
    v_result := v_result || jsonb_build_array(jsonb_build_object('deliveryId', v_job.id, 'attempt', v_job.attempt,
      'token', v_job.token, 'eventId', v_job.event_id, 'recipientUserId', v_job.recipient_user_id, 'nightId', v_job.night_id,
      'title', v_job.title, 'body', v_job.body, 'eventType', v_job.event_type)
      || case when v_job.event_type = 'preplot' then jsonb_build_object('preplot', true, 'title', v_job.title,
        'body', v_job.body, 'expiresAt', v_job.expires_at) else '{}'::jsonb end);
  end loop;
  return v_result;
end $$;


revoke all on function public.claim_native_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_native_notification_jobs(integer) to service_role;
