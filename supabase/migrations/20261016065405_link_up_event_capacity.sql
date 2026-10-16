-- Match the organizer dashboard's binary GB units (9 GiB = 9,663,676,416 bytes).
update public.photo_events
set storage_budget_bytes = 9663676416, updated_at = now()
where slug = 'the-link-up';
