import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const site = new URL(process.env['EXPO_PUBLIC_SITE_URL'] || 'https://dwdug.vercel.app');
  const rawProject: unknown = process.env['EXPO_PUBLIC_EAS_PROJECT_ID'];
  const rawTeam: unknown = process.env['DWD_APPLE_TEAM_ID'];
  const projectId = typeof rawProject === 'string' ? rawProject : undefined;
  const team = typeof rawTeam === 'string' ? rawTeam : undefined;
  // EAS file environment variable: Firebase's client configuration, not the
  // FCM service-account private key (that belongs in EAS credentials).
  const googleServicesFile = process.env['GOOGLE_SERVICES_JSON'];
  const rawExtra: unknown = config.extra;
  const extra =
    rawExtra && typeof rawExtra === 'object' ? (rawExtra as Record<string, unknown>) : {};
  return {
    ...config,
    name: config.name ?? 'Drink with Desire',
    slug: config.slug ?? 'drink-with-desire',
    extra: { ...extra, ...(projectId ? { eas: { projectId } } : {}) },
    ios: {
      ...config.ios,
      ...(team ? { appleTeamId: team } : {}),
      ...(site.protocol === 'https:' ? { associatedDomains: [`applinks:${site.hostname}`] } : {}),
    },
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(site.protocol === 'https:'
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                category: ['BROWSABLE', 'DEFAULT'],
                data: [{ scheme: 'https', host: site.hostname, pathPrefix: '/join/' }],
              },
            ],
          }
        : {}),
    },
  };
}
