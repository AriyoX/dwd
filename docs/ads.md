# Tonight banners and connecting ads

The mobile Tonight page and web home page have a horizontal banner carousel below the main actions and above the safety footer. Cards snap when swiped, show part of the next banner, and have tappable page dots. The web carousel also has previous/next controls for mouse and keyboard users. Banners scroll with the page.

Until sponsors are connected, three DWD house banners fill the space. Real campaigns are marked **Sponsored · advertiser**. There is no ad network SDK or revenue tracking installed.

## Connect sponsors now

1. Publish a public JSON file at an HTTPS URL you control. A static file on your existing hosting or CDN works; it does not need an API or database.
2. Use this format, replacing the example advertiser, destination, and optional image URL with your campaign:

   ```json
   {
     "ads": [
       {
         "id": "partner-ride-home",
         "advertiser": "Your partner",
         "title": "Your ride home, sorted.",
         "cta": "Book a ride",
         "url": "https://partner.example/book",
         "imageUrl": "https://cdn.example/ride-banner.jpg",
         "tone": "plum"
       },
       {
         "id": "partner-weekend",
         "advertiser": "Your venue",
         "title": "Make a weekend of it.",
         "cta": "See what's on",
         "url": "https://venue.example/events",
         "tone": "amber"
       }
     ]
   }
   ```

3. Set the feed address for each client:

   ```dotenv
   # apps/mobile/.env.local
   EXPO_PUBLIC_DWD_ADS_URL=https://your-domain.example/tonight-ads.json

   # apps/web/.env.local
   NEXT_PUBLIC_DWD_ADS_URL=https://your-domain.example/tonight-ads.json
   NEXT_PUBLIC_DWD_AD_IMAGE_ORIGINS=https://cdn.example
   ```

4. Restart Metro and the web dev server for local development. For installed mobile builds, set `EXPO_PUBLIC_DWD_ADS_URL` in the EAS environment used by the build profile and ship a new mobile build. For web, set both `NEXT_PUBLIC_` variables in the relevant Vercel environment and redeploy. Follow [mobile release setup](mobile-release-readiness.md) and [web deployment](deployment.md) for the existing workflows.
5. Open Tonight/home, swipe both directions, tap the dots, and tap each campaign to check its destination. Once the feed URL is bundled, changing the JSON updates campaigns on the next mobile screen focus or web page load/tab focus; individual campaign edits do not require another build.

On web, images are restricted by the Content Security Policy: list every campaign image origin in `NEXT_PUBLIC_DWD_AD_IMAGE_ORIGINS`, separated by commas. Changing this list requires a web deployment. A feed hosted on a different origin must allow browser reads with `Access-Control-Allow-Origin: https://your-app-domain` (or `*` for this public, credential-free feed). The web app allows connections only to the configured feed origin; keep feed redirects on that origin.

### Campaign fields

| Field        | Requirement                                              |
| ------------ | -------------------------------------------------------- |
| `id`         | Unique non-empty identifier, up to 80 characters.        |
| `advertiser` | Display name, up to 60 characters.                       |
| `title`      | Banner headline, up to 80 characters.                    |
| `cta`        | Action label, up to 30 characters.                       |
| `url`        | Public HTTPS destination opened on tap.                  |
| `imageUrl`   | Optional public HTTPS image.                             |
| `tone`       | Optional `plum`, `blue`, or `amber`; defaults to `plum`. |

Keep campaigns in the desired display order, with at most 10 entries. Use landscape images, around 1200 × 600 pixels, with visual detail toward the right; the app adds a dark overlay and renders the headline and action. Omit `imageUrl` for a solid-color banner. Keep text out of the artwork so it stays readable at larger font sizes. Image loading failures retain the banner text and destination.

The feed receives no account token, profile, drink log, or device coordinates. It is public configuration; do not put secrets in the JSON or environment variable. There are no automatic impressions/click reports or payments. Agree sponsor fees separately; destination URLs can include campaign parameters if you use partner-side reporting.

### Disable or recover

- Publish `{ "ads": [] }` to hide the placement.
- Leave the client's ads URL blank to use only the bundled DWD house banners.
- Offline requests, HTTP errors, malformed feeds, and requests exceeding six seconds fall back to house banners. Invalid entries and duplicate IDs are skipped; a feed containing only invalid entries also falls back. Starting or joining a night does not wait for ads.
- Only HTTPS links without embedded usernames/passwords are accepted. App deep links, HTTP URLs, and script URLs are rejected.

Implementation: [mobile carousel](../apps/mobile/src/components/tonight-banners.tsx), [web carousel](../apps/web/src/features/ads/tonight-banners.tsx), [shared validation and house banners](../packages/core/src/config/banner-ads.ts), [mobile environment](../apps/mobile/.env.example), [web environment](../.env.example).

## If you want Google AdMob

The feed above is ready for direct sponsors. AdMob requires a separate native SDK integration; an AdMob ad-unit ID cannot be used as the JSON feed URL.

1. [Create an AdMob account](https://support.google.com/admob/answer/7356219), add Android/iOS apps, and create banner units. Keep the platform App IDs and banner unit IDs separate.
2. From `apps/mobile`, run `npx expo install react-native-google-mobile-ads`. Add its config plugin with `androidAppId` and `iosAppId` to the existing Expo configuration. This requires rebuilding the native app; Expo Go cannot load the SDK. See the [official Expo installation guide](https://docs.page/invertase/react-native-google-mobile-ads/installation/expo).
3. Implement the SDK's [consent flow](https://docs.page/invertase/react-native-google-mobile-ads/consent-basics) and [initialization](https://docs.page/invertase/react-native-google-mobile-ads/initialization) before requesting ads. Update the app's privacy information for the selected SDK behavior.
4. Render an adaptive `BannerAd` in the bottom Tonight placement using `TestIds.ADAPTIVE_BANNER` during development. Keep a network-served banner in its own container, following the [banner integration guide](https://docs.page/invertase/react-native-google-mobile-ads/ad-formats/banner).
5. Verify the test ad on installed Android/iOS builds, then switch to the matching platform's production banner unit ID.

The native SDK installation, consent UI, account approval, and production unit IDs are not included in the current implementation.
