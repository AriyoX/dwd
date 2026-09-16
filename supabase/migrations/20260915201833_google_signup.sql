-- Google supplies identity, not the app's adult attestation. Defer its profile
-- until complete_signup; existing email signup validation remains unchanged.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_age_confirmed boolean := coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false);
begin
  if new.raw_app_meta_data ->> 'provider' = 'google' then
    return new;
  end if;
  if char_length(v_display_name) not between 1 and 60 then
    raise exception 'A valid display name is required.' using errcode = '22023';
  end if;
  if not v_age_confirmed then
    raise exception 'Adult confirmation is required.' using errcode = '22023';
  end if;
  insert into public.profiles (id, display_name) values (new.id, v_display_name);
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, after_data)
  values (new.id, 'profile.created', 'profile', new.id,
    jsonb_build_object('display_name', v_display_name, 'adult_confirmed', true));
  return new;
end;
$$;

-- This private transaction boundary creates only the caller's profile and audit
-- record. Browsers retain no direct INSERT grant on either table.
create or replace function private.complete_signup(p_display_name text, p_age_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_created uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_age_confirmed is distinct from true then
    raise exception 'Adult confirmation is required.' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'A valid display name is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = v_actor and email_confirmed_at is not null) then
    raise exception 'A verified email is required.' using errcode = '42501';
  end if;
  insert into public.profiles (id, display_name) values (v_actor, v_name)
  on conflict (id) do nothing returning id into v_created;
  if v_created is not null then
    insert into public.audit_events (actor_user_id, action, entity_type, entity_id, after_data)
    values (v_actor, 'profile.created', 'profile', v_actor,
      jsonb_build_object('display_name', v_name, 'adult_confirmed', true));
  end if;
end;
$$;

create or replace function public.complete_signup(p_display_name text, p_age_confirmed boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_signup(p_display_name, p_age_confirmed);
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.complete_signup(text, boolean) from public, anon;
revoke execute on function public.complete_signup(text, boolean) from public, anon;
grant execute on function private.complete_signup(text, boolean) to authenticated;
grant execute on function public.complete_signup(text, boolean) to authenticated;
