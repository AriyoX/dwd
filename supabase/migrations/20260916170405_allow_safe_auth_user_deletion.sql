-- A profile.created audit row is written for every email signup. Retain that
-- audit history without letting it block deletion of an otherwise unused Auth
-- account. Other user references keep their existing product-specific delete
-- behavior so an operator cannot accidentally erase a hosted shared night.
begin;

alter table public.audit_events
  drop constraint audit_events_actor_user_id_fkey;

alter table public.audit_events
  add constraint audit_events_actor_user_id_fkey
  foreign key (actor_user_id)
  references auth.users(id)
  on delete set null;

commit;
