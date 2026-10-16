create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
-- These fixtures must be committed so both independent connections see them.
create function public.test_photo_reservation(p_session uuid)
returns text language plpgsql as $$
begin
  perform public.link_up_reserve(p_session,gen_random_uuid(),jsonb_build_array(jsonb_build_object(
    'clientId',gen_random_uuid(),'fingerprint',repeat('b',64),'type','image/jpeg','size',1000)));
  perform pg_sleep(0.15);
  return 'reserved';
exception when others then return sqlerrm;
end $$;
update public.photo_events set storage_budget_bytes=4325376 where slug='the-link-up';
begin;
select extensions.plan(3);
select extensions.dblink_connect('photo_a','dbname=postgres user=supabase_admin');
select extensions.dblink_connect('photo_b','dbname=postgres user=supabase_admin');
select extensions.dblink_send_query('photo_a',$$select public.test_photo_reservation('eb100000-0000-4000-8000-000000000001')$$);
select extensions.dblink_send_query('photo_b',$$select public.test_photo_reservation('eb100000-0000-4000-8000-000000000002')$$);
create temporary table results(message text);
insert into results select message from extensions.dblink_get_result('photo_a') as result(message text);
insert into results select message from extensions.dblink_get_result('photo_b') as result(message text);
select extensions.is((select count(*) from results where message='reserved'),1::bigint,'exactly one concurrent reservation spends the final capacity');
select extensions.is((select count(*) from results where message='storage_quota'),1::bigint,'other concurrent browser receives a storage quota error');
select extensions.ok((select reserved_bytes+used_bytes<=storage_budget_bytes from public.photo_events),'concurrent reservations cannot overspend budget');
select extensions.dblink_disconnect('photo_a');
select extensions.dblink_disconnect('photo_b');
select * from extensions.finish();
rollback;
delete from public.photo_upload_reservations where session_id in ('eb100000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000002');
delete from public.photo_guest_sessions where id in ('eb100000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000002');
update public.photo_events set storage_budget_bytes=5368709120,reserved_bytes=0 where slug='the-link-up';
drop function public.test_photo_reservation(uuid);
