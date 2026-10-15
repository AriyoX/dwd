# Quick Log QA follow-up to f692e20

## Fixes

- Guest adoption now writes entries, eligibility, Undo, invitation intent and transfer operations in one account-record write. Previously, process death between two writes could leave a session present without its recovery metadata, which the next handoff would skip.
- Retrying account synchronization retries an unsaved guest ownership binding. Previously, an in-memory binding could prevent automatic recovery after storage became available.
- Sync receipts now determine the saved fingerprint and acknowledge the submitted lifecycle only if the local session has not changed. Newer server Finish states are accepted; new local taps and unresolved transfer revisions remain pending rather than falsely confirmed.
- Session update times advance monotonically, including Finish/Reopen in the same millisecond or after the device clock moves backwards. The Supabase RPC requires a strictly newer session timestamp. Locally retired concurrent sessions also remain pending until that retirement is saved remotely.
- Equivalent timestamp formats and entry order produce the same sync fingerprint. Recent activity and relative time share deterministic ordering for concurrent source positions.
- Undo reads the current store snapshot on both platforms. A waiting browser tab or mounted native screen can now undo the latest recovered action instead of an obsolete action captured at mount.
- Delayed web session lookups cannot overwrite a newer sign-out/account-switch event and trigger synchronization for obsolete credentials.
- Web session selection follows URL changes; stale-session continuation belongs to the selected session. Guest Back returns to the guest homepage.

## Interface changes

- Start Tonight uses compact, full-card Quick Log and Plan a Night choices with circular icons, clear hierarchy, and brief descriptions of the difference. Both platforms retain the existing burgundy/pink theme.
- Account benefits use a single heading and explicitly include Quick Log history. Native sheet and screen titles agree.
- Session options dismiss after logging/starting anew; web also supports outside tap and Escape, with focus restoration. The menu scrolls within small viewports.
- Added an empty activity message, responsive count typography, larger options targets, and a distinct age-acknowledgment container.
- Account-history deletion explains that only the device copy is removed and synchronization may restore it.
- Circular logging, reduced-motion behavior, original entry IDs/times, and count-only semantics remain. No volume, strength, or ethanol fields were added.

## Verification

- 65 targeted shared/routing tests passed.
- 17 renderer tests passed (15 native Quick Log cases and 2 web auth-race cases).
- 18 browser cases passed across desktop Chromium, mobile Chromium and mobile WebKit. The initial new menu test used `check()` on a checkbox removed after acceptance; it was corrected to click and assert enabled logging, then passed on all three projects.
- After Docker returned, 101 database assertions and all 15 focused mobile Chromium integration cases passed. Coverage includes real local signup, profile completion, cross-device restore, Start Tonight, Night creation, invitations and lost-response transfer recovery. Two integration cases initially referenced the old choice descriptions; their selectors were corrected to use stable choice names and both reruns passed. Related detailed-logging/shared-bottle selectors were updated too; those full suites were not rerun. Changed-test lint, formatting and whitespace checks passed.

Targeted shared tests cover handoff, failed storage, account isolation, duplicate prevention, concurrent edits, lifecycle reconciliation, invitation return paths, onboarding routing and count-only behavior. Native renderer checks cover logging, corrections, Undo, Start Tonight, guest benefits and transfer recovery. The existing mobile renderer dependency also hosts a web coordinator regression for delayed auth restoration; it requires no new testing dependencies.

The offline browser checks exercise actual controls on desktop Chromium, mobile Chromium and mobile WebKit, including two-tab takeover, exact Undo, refresh/History, failed writes, dismissible benefits and blocked authentication while taps are unsaved. Mobile screenshots were inspected; emulation does not establish physical-device behavior.

Docker was unavailable during the initial follow-up. After it returned, all 101 assertions across the five focused database suites passed. With explicit user approval, migrations `20261014110000` and `20261014120000` were applied to the hosted `drink-with-desire` project (`kdplbebaotvgcvjggacz`). Post-migration SQL confirmed both versions, owner-only read policies, RLS on both tables, no anonymous access or direct client writes, and the sync/history RPCs. Application clients were not deployed.

The security advisor returned existing notices for other public SECURITY DEFINER RPCs and policy-free internal tables, plus [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The new Quick Log public wrappers are SECURITY INVOKER. These broader project settings were not changed by the migration.

The follow-up design review used `animate-expo` and `apple-design`: the shared native Action uses Reanimated transform/opacity feedback with scale 0.97, 48-point targets, press retention and reduced-motion support. Start Tonight/benefits use native form sheets; no extra entrance animation was added to frequent logging actions. Physical-device feel remains unverified. The earlier results in `quick-log-entry.md` describe the previous implementation, not this follow-up.

### Design skill verification

The initial implementation used `mobile-native` and the personal `concise-ui-copy` skill, along with Supabase guidance. `apple-design` and `animate-expo` were applied in the subsequent review. After inspecting all 13 skills under `.agents/skills`, the additional review applied `emil-design-eng`, `review-animations`, and `animate`; these were not all used in the initial implementation.

| Before                                                                               | After                                             | Why                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Web circular control and native Action used symmetric 120ms press/release feedback.  | Press remains 120ms; release takes 100ms.         | The response settles faster while retaining interruptible transform/opacity transitions.     |
| Web circular control inherited its own transition declaration during keyboard focus. | Explicit `:focus-visible` transition suppression. | Keeps keyboard feedback immediate, including when focus changes during a pointer transition. |

Motion review verdict: **Approve** for the inspected Quick Log controls and entry sheets at the code level. Reduced-motion handling, touch-only behavior, short durations, and keyboard entry behavior were checked. Physical-device motion quality remains a release check.

The remaining local skills were considered but not invoked: `ask-sonner` (no Sonner work), `write-swift` (no Swift changes), `animation-vocabulary` (terminology lookup), `pick-ui-library` and `prototype` (explicit-use workflows not requested), and `find-animation-opportunities` / `improve-animations` (proposal-only workflows, unnecessary for this focused implementation and review).

## Reproduction commands and remaining release checks

The database and browser commands below reproduce the completed checks (the focused integration run used `--project=mobile`). Full release checks and device checks remain. Start Docker Desktop and the dedicated local E2E Supabase backend configured by `.tmp/e2e.env`, with the existing migrations applied locally. Do not point browser tests at the hosted project. Run from the repository root:

```powershell
# Isolated database regression suites (creates a disposable Postgres container).
npm run test:db -- quick_account_sessions.sql quick_account_concurrency.sql quick_log.sql quick_log_concurrency.sql quick_chasers.sql

# Real account sign-in/signup, onboarding, Start Tonight, invitations and Night transfer.
npx playwright test tests/e2e/quick-primary.spec.ts tests/e2e/quick-transfer.spec.ts tests/e2e/quick-chasers.spec.ts tests/e2e/onboarding.spec.ts

# Full release checks, intentionally left to the user.
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

For native JavaScript/Hermes export checks:

```powershell
Set-Location apps/mobile
npx expo export --platform ios --output-dir ../../.tmp/quick-log-qa-ios --max-workers 2
npx expo export --platform android --output-dir ../../.tmp/quick-log-qa-android --max-workers 2
```

On physical iOS and Android, verify large text, VoiceOver/TalkBack, one-handed controls, sheet dismissal, safe areas, background/process death, airplane-mode logging/reconnection, account switching and deep-link invitations. Test actual Safari/Chrome and installed home-screen mode. Use the device checklist in `quick-log.md` for details.

Please return any remaining release-check output and device findings before releasing the clients. Hosted Quick Log migrations are applied. Concurrent equal-revision edits retain the existing conflict behavior: the local copy is kept and the user must review the conflict; no automatic overwrite was introduced.
