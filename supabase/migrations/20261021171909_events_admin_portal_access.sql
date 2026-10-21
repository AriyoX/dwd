begin;

-- Bootstrap explicit portal membership once for the existing event organizers.
-- Never restore an existing disabled grant or seed grants during sign-in.
insert into public.page_admin_access(page_path,user_id,email,role,enabled)
select '/events/admin',user_id,email,role,true
from public.page_admin_access
where page_path='/events/admin/the-link-up' and enabled and role='admin'
on conflict (page_path,user_id) do nothing;

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
      and a.page_path=regexp_replace(p_page_path, '^/events/([a-z0-9][a-z0-9_-]*)/admin$', '/events/admin/\1')
      and a.enabled and a.role='admin'
      and a.email=lower(btrim(u.email)) and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
      -- Every event requires both portal membership and its own exact grant.
      -- This also protects APIs from previous deployments during rollout.
      and (a.page_path not like '/events/admin/%' or exists (
        select 1 from public.page_admin_access portal
        where portal.page_path='/events/admin' and portal.user_id=a.user_id
          and portal.email=a.email and portal.role='admin' and portal.enabled
      ))
  );
end $$;
revoke all on function private.has_page_admin_access(uuid,text) from public,anon,authenticated;
grant execute on function private.has_page_admin_access(uuid,text) to service_role;

comment on table public.page_admin_access is 'Explicit portal and exact-page grants. /events/admin grants portal membership. Each /events/admin/<event-slug> also requires its own enabled grant. Disabling the portal grant blocks all event pages and APIs, including legacy URLs. Manage through trusted Supabase dashboard or SQL only; sign-in never recreates grants.';

commit;
