-- Deploy delete-accounts and configure its matching Edge Function/Vault secret first.
begin;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'dwd_deletion_url'
    and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/delete-accounts$')
    or not exists (select 1 from vault.decrypted_secrets where name = 'dwd_deletion_secret'
      and length(decrypted_secret) >= 32) then
    raise exception 'Configure account deletion worker secrets in Vault before scheduling.';
  end if;
end;
$$;
select cron.schedule('dwd-delete-accounts', '0 * * * *', 'select private.dispatch_account_deletions();');
commit;
