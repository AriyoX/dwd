# Mobile UX refinement — 7 October 2026

Implemented on top of the existing mobile QA work, preserving the brand, routes,
plan rules, consent, bottle inventory rules and destructive-action confirmations.

## Main changes

- Home prioritizes active nights; starting another night is secondary.
- Active nights keep the main drink action in the safe-area footer. Chaser logging,
  other drinks, shared bottles, counts and Entries remain visible in the body.
  Plan editing, missed entries and reminders live under More night options.
- The drink chooser includes recent drinks from this person's night, excludes
  duplicates already in their plan, and keeps Custom drink reachable in the footer.
- Custom drinks show name, serving and strength first; drink type expands separately.
- Setup keeps existing defaults, with exact end time/time zone and managed guests
  behind labelled expanders. Selected plan items appear before the drink catalogue.
- Pending entries use compact Saved on phone / Review needed states. Entry options
  expand on demand; entries needing attention start open. Timeline undo is inline.
- Invitations prioritize Share, with administration under Invite options.
- Settings uses grouped rows for Your nights, Appearance, and Help & privacy.
  Appearance choices are compact; local help, blocked people and account actions expand.
- Shared Action controls enforce a minimum 48-point hit area and distinguish busy
  from disabled feedback. Disabled fields expose their state. Expanders expose their
  open state and hide collapsed controls from accessibility traversal.

## Screenshot follow-up

The first refinement accidentally removed the active-night body while retaining its
footer. Restored the complete control section and added a screen-composition regression
test covering the visible actions, guest targeting, Entries and ended-night behavior.

Saved invitations rejected Postgres-style offset timestamps, despite initially accepting
and displaying the server result. Invite dates now accept offsets and normalize to UTC;
previously saved offset dates also recover. Links keep their 24-hour lifetime. Expired,
exhausted or missing server links renew automatically; validation connection failures
preserve a locally valid link. Explicit revocation, including from another phone, remains
off. A stale validation response cannot overwrite a newer revocation.

When someone adds a bottle during a night, eligible participants see an On the table
card linking directly to its portion/plan form. Each person explicitly chooses whether
to make it their main drink. Existing drinks are preserved. Creating a bottle returns to
the shelf with confirmation rather than jumping straight to drink logging. Creator main
drink choices are visible outside advanced sharing options. No group-wide plan changes,
push messages or additional permission prompts were added.

## Validation and limits

The follow-up also renames the installed app, shared legal copy, web manifest and
wordmark accessibility label to **dwd**. A native light/dark splash uses the existing
vector logo; its PNG assets regenerate with `node scripts/generate-mobile-brand.mjs`.
The EAS project, bundle identifiers and internal project slug stay linked to the same
app. Ads join Live Activities/widgets on the future roadmap; neither ships in this pass.
See [the TestFlight guide](ios-testflight.md) for signing, installing and testing the build.

Regression coverage includes reopening offset-dated invitations after five minutes,
renewal, offline validation, revocation races, all major active-night controls and
joining/switching the chosen bottle participant without automatically logging a drink.
Static checks and Android/iOS Metro/Hermes exports are run for this pass. Exports are
bundle checks, not newly installed APK/IPA builds.

Final checks: all workspace TypeScript checks, targeted ESLint, 484 unit tests and 84
mobile integration tests passed. Expo dependency compatibility passed. Native config
introspection confirmed **dwd** for both platform display names and the iOS splash
storyboard/Android splash configuration. Splash assets were visually inspected.

Visual decisions use the supplied Android screenshots. At the user's request, further
simulator/browser setup was stopped to save usage. The updated layouts still need device
visual acceptance, including large text, keyboard behavior and iOS sheets. Existing
gesture/keyboard/safe-area integration checks remain enabled.
