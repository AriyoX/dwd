begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(11);
create function pg_temp.photo_file(p_size integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('clientId','ec100000-0000-4000-8000-000000000001',
    'fingerprint',repeat('a',64),'type','image/jpeg','size',p_size))
$$;
set local role service_role;
create temporary table chosen as select * from public.link_up_reserve(
  'ec200000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000001',pg_temp.photo_file(4194304));
select extensions.is((select expected_bytes from chosen),4194304,'accept a 4 MiB image');
select extensions.is((select reserved_bytes from public.photo_events),4325376::bigint,'reserve 4 MiB plus 128 KiB thumbnail');
select extensions.is((select count(*) from public.link_up_reserve(
  'ec200000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000001',pg_temp.photo_file(4194304))),1::bigint,'recover the same 4 MiB batch');
select extensions.is((select reserved_bytes from public.photo_events),4325376::bigint,'batch retries do not double reserve');
select extensions.throws_ok($$select * from public.link_up_reserve(
  'ec200000-0000-4000-8000-000000000002',gen_random_uuid(),pg_temp.photo_file(4194305))$$,
  '23514',null,'reject one byte over the 4 MiB input limit');
select extensions.is((public.link_up_claim('ec200000-0000-4000-8000-000000000001',
  (select id from chosen),'ec400000-0000-4000-8000-000000000001')).status,'verifying','claim a maximum-size upload');
select extensions.throws_ok($$select public.link_up_finish((select id from chosen),
  'ec400000-0000-4000-8000-000000000001',4194305,131072,2048,1536)$$,
  '23514',null,'reject a normalized image over 4 MiB');
select extensions.is(public.link_up_finish((select id from chosen),
  'ec400000-0000-4000-8000-000000000001',4194304,131072,2048,1536),(select id from chosen),'publish a maximum-size photo and thumbnail');
select extensions.is((select used_bytes from public.photo_events),4325376::bigint,'charge the complete published image and thumbnail');
select extensions.is((select reserved_bytes from public.photo_events),0::bigint,'release the full hold on completion');
select extensions.is((select size_bytes from public.event_photos),4194304,'store the larger photo size');
reset role;
select * from extensions.finish();
rollback;
