begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Cron runs as its creating database operator. This is deliberately INVOKER:
-- browser roles must never be able to read Vault or invoke the dispatch worker.
create or replace function private.dispatch_due_notifications()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'dwd_dispatch_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'dwd_dispatch_secret';

  -- An unconfigured local or preview database must not make outbound requests.
  if v_url is null or v_secret is null or length(v_secret) < 32 then
    return null;
  end if;
  if v_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/dispatch-notifications$' then
    raise exception 'Invalid DWD notification dispatch URL.' using errcode = '22023';
  end if;

  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dwd-dispatch-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.dispatch_due_notifications() from public, anon, authenticated, service_role;

-- Scheduling is an explicit environment operation after the function and Vault
-- values are configured. See supabase/operations/enable-notification-scheduler.sql.
commit;
