begin;

-- Push carries the same message as the inbox. The service worker still verifies
-- the current account before displaying any event text or night link.
create or replace function public.claim_notification_jobs(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_result jsonb := '[]'::jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is not null then raise exception 'Worker access required.' using errcode = '42501'; end if;
  perform private.create_due_notification_events();
  insert into public.notification_deliveries (event_id, subscription_id)
  select e.id, s.id
  from public.notification_events e
  join public.push_subscriptions s on s.user_id = e.recipient_user_id and s.disabled_at is null and (s.expiration_time is null or s.expiration_time > clock_timestamp())
  left join public.nights n on n.id = e.night_id
  left join public.notification_preferences p on p.user_id = e.recipient_user_id
  left join public.night_members recipient_member
    on recipient_member.night_id = e.night_id
   and recipient_member.user_id = e.recipient_user_id
   and recipient_member.left_at is null
  left join public.night_members target_member
    on target_member.id = e.target_member_id
   and target_member.left_at is null
  where e.acknowledged_at is null and private.notification_is_current(e)
    and e.created_at > clock_timestamp() - interval '24 hours'
    and (e.expires_at is null or e.expires_at > clock_timestamp())
    and s.user_id = e.recipient_user_id
    and (e.night_id is null or (n.status = 'active' and recipient_member.id is not null))
    and (e.target_member_id is null or target_member.id is not null)
    and case
      when e.category = 'group_attention' then coalesce(p.group_attention_enabled, true)
      when e.category = 'direct_checkin' then coalesce(p.direct_checkins_enabled, true)
      when e.event_type = 'personal_pace' then coalesce(p.personal_pace_enabled, false)
      when e.event_type = 'planned_end' then coalesce(p.planned_end_enabled, false)
      when e.event_type = 'periodic_water' then coalesce(p.periodic_water_enabled, false)
      else false
    end
  on conflict (event_id, subscription_id) do nothing;

  for v_job in
    select
      d.id as delivery_id,
      d.attempts + 1 as attempt,
      s.endpoint,
      s.p256dh,
      s.auth,
      e.id as event_id,
      e.deep_link,
      e.title as push_title,
      e.body as push_body
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    join public.push_subscriptions s on s.id = d.subscription_id
    left join public.nights n on n.id = e.night_id
    left join public.notification_preferences p on p.user_id = e.recipient_user_id
    left join public.night_members recipient_member
      on recipient_member.night_id = e.night_id
     and recipient_member.user_id = e.recipient_user_id
     and recipient_member.left_at is null
    left join public.night_members target_member
      on target_member.id = e.target_member_id
     and target_member.left_at is null
    where (d.status in ('queued', 'failed') or (d.status = 'sending' and d.next_attempt_at <= clock_timestamp()))
      and d.attempts < 5
      and d.next_attempt_at <= clock_timestamp()
      and s.disabled_at is null and (s.expiration_time is null or s.expiration_time > clock_timestamp())
      and e.acknowledged_at is null and private.notification_is_current(e)
      and e.created_at > clock_timestamp() - interval '24 hours'
      and (e.expires_at is null or e.expires_at > clock_timestamp())
      and s.user_id = e.recipient_user_id
      and (e.night_id is null or (n.status = 'active' and recipient_member.id is not null))
      and (e.target_member_id is null or target_member.id is not null)
      and case
        when e.category = 'group_attention' then coalesce(p.group_attention_enabled, true)
        when e.category = 'direct_checkin' then coalesce(p.direct_checkins_enabled, true)
        when e.event_type = 'personal_pace' then coalesce(p.personal_pace_enabled, false)
        when e.event_type = 'planned_end' then coalesce(p.planned_end_enabled, false)
        when e.event_type = 'periodic_water' then coalesce(p.periodic_water_enabled, false)
        else false
      end
    order by d.next_attempt_at, d.id
    limit v_limit
    for update of d skip locked
  loop
    update public.notification_deliveries
    set status = 'sending', attempts = attempts + 1, next_attempt_at = clock_timestamp() + interval '2 minutes'
    where id = v_job.delivery_id;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'deliveryId', v_job.delivery_id,
      'attempt', v_job.attempt,
      'endpoint', v_job.endpoint,
      'p256dh', v_job.p256dh,
      'auth', v_job.auth,
      'title', v_job.push_title,
      'body', v_job.push_body,
      'url', v_job.deep_link,
      'eventId', v_job.event_id
    ));
  end loop;
  return v_result;
end;
$$;

revoke all on function public.claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;

commit;
