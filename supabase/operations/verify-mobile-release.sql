-- Operator-only, read-only release diagnostics. No tokens, messages or user IDs.
-- Run in the DWD SQL editor after migrations and worker deployment.
select jsonb_build_object(
  'latest_migration', (
    select version from supabase_migrations.schema_migrations order by version desc limit 1
  ),
  'native_tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname, 'rls', c.relrowsecurity,
      'authenticated_can_read', has_table_privilege('authenticated', c.oid, 'SELECT')
    ))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('native_push_subscriptions', 'native_notification_deliveries')
  ),
  'register_allowed', has_function_privilege('authenticated', 'public.register_native_push(uuid,text,text)', 'EXECUTE'),
  'anonymous_register_allowed', has_function_privilege('anon', 'public.register_native_push(uuid,text,text)', 'EXECUTE'),
  'user_can_claim', has_function_privilege('authenticated', 'public.claim_native_notification_jobs(integer)', 'EXECUTE'),
  'worker_can_claim', has_function_privilege('service_role', 'public.claim_native_notification_jobs(integer)', 'EXECUTE'),
  'schedulers', (
    select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active))
    from cron.job where jobname in ('dwd-dispatch-notifications', 'dwd-delete-accounts')
  ),
  'native_devices', (select count(*) from public.native_push_subscriptions),
  'delivery_statuses', (
    select coalesce(jsonb_object_agg(status, amount), '{}'::jsonb)
    from (select status, count(*) as amount from public.native_notification_deliveries group by status) d
  ),
  'recent_dispatch', (
    select jsonb_agg(to_jsonb(r)) from (
      select created, status_code, timed_out, content::jsonb -> 'ok' as ok,
        content::jsonb -> 'native' as native
      from net._http_response where content like '%"native"%'
      order by created desc limit 3
    ) r
  )
) as mobile_release;
