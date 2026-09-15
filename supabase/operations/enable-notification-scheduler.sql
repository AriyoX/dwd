-- Run as postgres only after deploying dispatch-notifications and populating
-- dwd_dispatch_url / dwd_dispatch_secret in Vault. No credentials belong here.
begin;
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'dwd_dispatch_url'
      and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/dispatch-notifications$'
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'dwd_dispatch_secret' and length(decrypted_secret) >= 32
  ) then
    raise exception 'Configure DWD dispatch secrets in Vault before scheduling.';
  end if;
end;
$$;

select cron.schedule(
  'dwd-dispatch-notifications',
  '* * * * *',
  'select private.dispatch_due_notifications();'
);
commit;
