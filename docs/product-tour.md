# Product tour

The tour uses the same `NightFrame`, `TonightView`, `DrinkChooser`, `ParticipantCard`,
`HistoryScreen`, and `SummaryScreen` components as normal app use. It does not render
miniature copies of controls in its explanation cards.

## Adding a step

Define the route, stable `data-tour` target, title, short description, and preferred
placement in `apps/web/src/features/tour/steps.ts`. A step may allow interaction,
intercept a target click to move to another step, or follow a link to another screen
(as History does for the summary). Screen-specific temporary state belongs in
`tour-screens.tsx`, not the coach-mark renderer.

`CoachMark` waits for the route's target using DOM and resize observers. It measures
the real control, selects a placement that fits the viewport, and scrolls it into
view when needed. Only the explanation card and interactive target accept focus
or pointer input. Opening a real drink chooser or help dialog suspends the coach
until that dialog closes. Practice emergency calls are disabled.

Steps on Home or the practice night update search params through Next's native
History API integration, so Next/Back and Tonight/Group switches do not refetch
the current page. The provider prefetches the next distinct screen while the user
reads, deduplicating requests. History still navigates normally because its query
selects a different server data source. Browser tests assert that local step
changes make no foreground server-component requests.

## Data boundary

`tour-screens.tsx` imports presentation components and pure sample operations. It
never mounts the live night controller, outbox, Realtime provider, notifications,
or product server actions. Reserved non-UUID identifiers such as `tour` cannot
identify real database records. The reserved night routes branch before database
queries; History's tour route also bypasses real history loading.

Sample entries exist only in React state. Session storage contains just the normal
return route, under a user-specific key. Refresh resumes the current step with a
fresh practice night. Finish, Skip, close, or navigation away discards the sample
state and removes that session key. Stale tour URLs return to normal app screens.

The existing account `tour_seen` preference and user-specific local fallback control
automatic onboarding. Manual replay does not reset that preference or write product
data. The account preference is a display setting, never an authorization claim.
An authenticated, same-origin POST saves it without invalidating Next's page cache,
so the background save cannot race a step change or throw away prefetched screens.

## Home-screen installation

The app manifest and PNG icons support standalone installation. A dismissible tip
appears on Home or Account after onboarding and stays hidden during the tour or
when running as an installed app. Browsers exposing `beforeinstallprompt` receive
an install button; other browsers receive brief platform-specific instructions.
The tip makes no claim of offline page availability and introduces no caching of
authenticated pages.

## Verification

`tour.test.ts` tests route matching, return-path validation, sample-state isolation,
and placement. Playwright covers desktop and mobile navigation, actual logging,
drink and help dialogs, keyboard focus, Back/Next/Skip, account persistence, replay,
refresh, stale routes, cleanup, the install tip, and manifest assets. The real-night
onboarding test replays the tour and confirms its actual entries remain unchanged.
