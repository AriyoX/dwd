begin;

-- A grant belongs to exactly one page and one verified identity. No global admin flag.
create table public.page_admin_access (
  page_path text not null check (page_path ~ '^/[a-z0-9][a-z0-9/_-]*$' and length(page_path) <= 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role text not null default 'admin' check (role = 'admin'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(page_path,user_id)
);
create index page_admin_access_user_idx on public.page_admin_access(user_id);
alter table public.page_admin_access enable row level security;
revoke all on public.page_admin_access from public,anon,authenticated;
grant all on public.page_admin_access to service_role;
comment on table public.page_admin_access is 'Page-specific grants. Disable or delete a row to revoke access; requests never recreate grants. Manage through the Supabase dashboard or trusted SQL.';

-- One-time bootstrap only. Revocation remains effective on subsequent sign-ins.
-- JSON lookup also supports the lightweight auth.users fixture in database tests.
insert into public.page_admin_access(page_path,user_id,email)
select '/events/the-link-up/admin',u.id,lower(btrim(u.email)) from auth.users u
where lower(btrim(u.email)) in ('shebatindy@gmail.com','ahumuzaariyo@gmail.com')
  and to_jsonb(u)->>'email_confirmed_at' is not null;

create function private.has_page_admin_access(p_user uuid,p_page_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() <> p_user) then
    raise exception 'Server authorization required.' using errcode='42501';
  end if;
  return exists (
    select 1 from public.page_admin_access a join auth.users u on u.id=a.user_id
    where a.user_id=p_user and a.page_path=p_page_path and a.enabled and a.role='admin'
      and a.email=lower(btrim(u.email)) and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
  );
end $$;
revoke all on function private.has_page_admin_access(uuid,text) from public,anon,authenticated;
grant execute on function private.has_page_admin_access(uuid,text) to service_role;
create function public.has_page_admin_access(p_user uuid,p_page_path text)
returns boolean language sql security invoker set search_path='' as $$
  select private.has_page_admin_access(p_user,p_page_path);
$$;
revoke all on function public.has_page_admin_access(uuid,text) from public,anon,authenticated;
grant execute on function public.has_page_admin_access(uuid,text) to service_role;

-- Compatibility for the previous deployment during rollout; now read-only.
-- Neither legacy function can recreate a removed or disabled access record.
create or replace function private.link_up_verified_organizer(p_user uuid)
returns boolean language sql security invoker set search_path='' as $$
  select private.has_page_admin_access(p_user,'/events/the-link-up/admin');
$$;
comment on function public.link_up_provision_organizer(uuid) is 'Legacy compatibility check only. Does not provision access; checks page_admin_access.';
comment on table public.photo_event_organizers is 'Legacy Phase 2 organizer metadata; not used for authorization. Manage current access in public.page_admin_access.';

commit;
