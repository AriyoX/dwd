-- Apple and Google identities must finish the same explicit adult/profile flow.
-- Use trusted provider metadata; user-editable metadata cannot bypass signup.
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
  if new.raw_app_meta_data ->> 'provider' in ('google', 'apple') then
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

revoke execute on function private.handle_new_user() from public, anon, authenticated;
