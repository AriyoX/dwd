begin;

-- Move each exact event-page grant in place. Identity, enabled state and timestamps
-- are preserved. A conflicting target key aborts the transaction rather than
-- overwriting either grant. Other page grants and all photo data stay untouched.
update public.page_admin_access
set page_path = regexp_replace(page_path, '^/events/([a-z0-9][a-z0-9_-]*)/admin$', '/events/admin/\1')
where page_path ~ '^/events/[a-z0-9][a-z0-9_-]*/admin$';

create or replace function private.has_page_admin_access(p_user uuid,p_page_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() <> p_user) then
    raise exception 'Server authorization required.' using errcode='42501';
  end if;
  return exists (
    select 1 from public.page_admin_access a join auth.users u on u.id=a.user_id
    where a.user_id=p_user
      -- Previous deployments use the same live grant during rollout.
      and a.page_path=regexp_replace(p_page_path, '^/events/([a-z0-9][a-z0-9_-]*)/admin$', '/events/admin/\1')
      and a.enabled and a.role='admin'
      and a.email=lower(btrim(u.email)) and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
  );
end $$;
revoke all on function private.has_page_admin_access(uuid,text) from public,anon,authenticated;
grant execute on function private.has_page_admin_access(uuid,text) to service_role;

create or replace function private.link_up_verified_organizer(p_user uuid)
returns boolean language sql security invoker set search_path='' as $$
  select private.has_page_admin_access(p_user,'/events/admin/the-link-up');
$$;

comment on table public.page_admin_access is 'Exact page grants. Event dashboards use /events/admin/<event-slug>. The events portal lists permitted dashboards without granting access to other events. Disable or delete a row to revoke access. Manage through trusted Supabase dashboard or SQL only.';

commit;
