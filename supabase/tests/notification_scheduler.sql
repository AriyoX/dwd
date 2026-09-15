begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'private.dispatch_due_notifications()'::regprocedure),
  'scheduler uses the operator privileges without SECURITY DEFINER'
);
select extensions.ok(not has_function_privilege('anon', 'private.dispatch_due_notifications()', 'execute'), 'anonymous clients cannot dispatch');
select extensions.ok(not has_function_privilege('authenticated', 'private.dispatch_due_notifications()', 'execute'), 'account clients cannot dispatch');
select extensions.ok(not has_function_privilege('service_role', 'private.dispatch_due_notifications()', 'execute'), 'worker API cannot invoke the scheduler');
select extensions.is(private.dispatch_due_notifications(), null::bigint, 'missing Vault configuration does not enqueue a request');

select vault.create_secret('https://example.test/steal', 'dwd_dispatch_url');
select vault.create_secret(repeat('x', 32), 'dwd_dispatch_secret');
select extensions.throws_ok(
  'select private.dispatch_due_notifications()', '22023', 'Invalid DWD notification dispatch URL.',
  'rejects a dispatch URL outside the Supabase worker route'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'dwd_dispatch_url'),
  'https://schedulerfixture.supabase.co/functions/v1/dispatch-notifications'
);
select extensions.ok(private.dispatch_due_notifications() is not null, 'configured scheduler queues a request');
select extensions.ok(
  exists (select 1 from net.http_request_queue where url = 'https://schedulerfixture.supabase.co/functions/v1/dispatch-notifications'
    and headers->>'x-dwd-dispatch-secret' = repeat('x', 32) and timeout_milliseconds = 55000),
  'queued request includes server authentication and a bounded timeout'
);
select extensions.is((select count(*) from cron.job where jobname = 'dwd-dispatch-notifications'), 0::bigint, 'migrations do not automatically activate background dispatch');

select * from extensions.finish(true);
-- pg_net only sends after commit. These fixture requests are never sent.
rollback;
