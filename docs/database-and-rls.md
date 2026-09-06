# Database and RLS

## Schema and lifecycle

The migration creates `profiles`, `nights`, immutable `night_end_time_changes`, `night_members`, versioned `drink_plan_items`, alcohol `drink_logs`, separate `water_logs`, hashed `night_invites`, deterministic `night_alerts`, and private `audit_events`.

Alcohol logs store generated pure-ethanol grams with:

```text
volume_ml × (abv_percent / 100) × 0.789
```

Historical label/category/volume/ABV snapshots are immutable. Plan edits archive current rows and insert versions. Current plan calculations use only active versions; a delayed log may reference the exact version valid at `consumed_at`.

Every log target has a composite foreign key back to `(night_id, night_member_id)`. Plan references use `(night_member_id, plan_item_id)`. Unique actor/idempotency constraints make retries safe. Water remains a separate activity and never changes ethanol totals.

## Critical RPCs

- `start_night_out`: one transaction for night, host, plans, guests, and audit; host creation key is idempotent.
- `redeem_night_invite`: locked, idempotent membership insert/reactivation and conditional use count.
- `log_drink`: sole alcohol insert path; derives actor, night, permission, snapshot, ethanol, current plan, prospective end classification, confirmation requirements, and deduplicated alerts.
- `log_water`: same ownership and grace rules without affecting alcohol math.
- `replace_member_plan`: archives and inserts versions atomically; audits increases.
- `soft_delete_activity`: one-way soft deletion within 15 minutes of canonical creation.
- `extend_night`: host-only row lock, immutable extension record, maximum duration, audit.
- `end_night`: idempotent host-only irreversible end at database time.
- `add_managed_guest`, `remove_managed_guest`, `leave_night`, and constrained invite/title operations.

All write-capable RPCs validate `auth.uid()`. The anonymous preview is the only public RPC and returns no participant list, consumption, email, token, or account-discovery result.

## Permission matrix

| Capability                  | Host account               | Account participant | Guest manager            | Non-member        | Unauthenticated   |
| --------------------------- | -------------------------- | ------------------- | ------------------------ | ----------------- | ----------------- |
| Read active shared night    | Yes                        | Yes                 | Through host membership  | No                | No                |
| Read after leaving          | No                         | No                  | N/A                      | No                | No                |
| Edit own account plan       | Yes                        | Yes                 | Yes, as own account      | No                | No                |
| Edit another account plan   | No                         | No                  | No                       | No                | No                |
| Log/correct own activity    | Yes                        | Yes                 | Yes, as own account      | No                | No                |
| Log/correct managed guest   | Yes                        | No                  | Host is the sole manager | No                | No                |
| Create/remove managed guest | Yes                        | No                  | Host only                | No                | No                |
| Edit another account log    | No                         | No                  | No                       | No                | No                |
| View group alerts           | Yes                        | Yes                 | Yes                      | No                | No                |
| View private account alert  | Only own                   | Only own            | Only own                 | No                | No                |
| View private guest alert    | If managing guest          | No                  | Yes                      | No                | No                |
| Create/rotate/revoke invite | Yes                        | No                  | Host only                | No                | No                |
| Preview valid invite        | Safe preview               | Safe preview        | Safe preview             | Safe preview      | Safe preview      |
| Redeem invite               | Idempotent existing member | Yes                 | As account               | No membership yet | Must authenticate |
| Extend/end active night     | Yes                        | No                  | Host only                | No                | No                |
| Leave active night          | No; must end               | Yes                 | Host cannot leave        | N/A               | N/A               |

“Guest manager” is not a second independent role in this MVP: it is the host acting on a guest whose `managed_by_user_id` equals the host.

## RLS design

All ten public tables enable RLS. Membership helper functions live in `private`, bypass recursive `night_members` policy evaluation, require their supplied user ID to equal `auth.uid()`, use empty search paths, and are the only private helpers executable by `authenticated`.

Current account membership (`left_at is null`) gates shared-night, member, plan, log, water, extension, group-alert, and shared-profile reads. Drink and water policies expose only non-deleted rows. Private alert policy additionally requires the affected account user or managed-guest manager.

No direct browser table privilege exists for `night_invites` or `audit_events`. No browser role can directly insert or delete product tables. Direct updates are limited to the caller’s own profile display name with both `USING` and `WITH CHECK`; lifecycle, plans, guests, logs, alerts, title, extensions, and status all use constrained RPCs.

The helper functions avoid policy recursion because they are SECURITY DEFINER and query membership beneath the invoking RLS expression. They do not authorize from JWT user metadata.

## Indexes

Indexes cover host ownership, current memberships, guest managers, night/member timelines, active plan rows, actor log lookup, invite night lookup, alert membership, audit ownership, and extension effective time. Partial indexes enforce one host, one account membership, and one active quick-log item.

## Audit coverage

Audit rows cover profile creation, night start/end, prospective extension, post-start plan increases, activity soft deletion, guest creation/removal, and invite creation/rotation/revocation. Browser roles have no audit-table access. Historical activity rows are soft-deleted rather than destroyed.

## Verification queries after migration

Run these in the dedicated project SQL Editor or `psql` after `supabase db reset`/`db push`:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema in ('public', 'private')
order by routine_schema, routine_name;
```

Then run `supabase inspect db table-stats --local`, `supabase inspect db index-stats --local`, and the Dashboard database/security advisors where available. During implementation, the migration was applied to isolated Supabase PostgreSQL 17 containers, `supabase db lint --level warning` reported no schema errors, all ten product tables were verified with RLS enabled, and the 42-assertion pgTAP lifecycle suite passed. The full local Supabase stack and remote Dashboard advisors were not available because `supabase start` did not complete and no dedicated remote project was linked.
