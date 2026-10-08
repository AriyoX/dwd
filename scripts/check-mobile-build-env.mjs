import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Fail before bundling an installed app that cannot sign in or register push.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const errors = [];
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}
try {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname.includes('YOUR_'.toLowerCase()))
    throw new Error('Invalid backend');
} catch {
  errors.push('EXPO_PUBLIC_SUPABASE_URL must be the HTTPS backend URL');
}
let publicKey = key?.startsWith('sb_publishable_') && !key.includes('REPLACE_ME');
if (key?.startsWith('eyJ')) {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
    publicKey = Boolean(
      payload && typeof payload === 'object' && 'role' in payload && payload.role === 'anon',
    );
  } catch {
    /* Invalid legacy key. */
  }
}
if (!publicKey) errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a public client key');
if (process.env.EAS_BUILD_PLATFORM === 'android' || process.env.EAS_BUILD_PLATFORM === 'ios') {
  /** @type {unknown} */
  const rawConfig = JSON.parse(
    readFileSync(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'),
  );
  const expo = object(object(rawConfig).expo);
  const android = object(expo.android);
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || object(object(expo.extra).eas).projectId;
  if (
    typeof projectId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
  )
    errors.push('A valid EAS project ID is required for push notifications');
  if (process.env.EAS_BUILD_PLATFORM === 'android') {
    const servicesPath = process.env.GOOGLE_SERVICES_JSON?.trim() || android.googleServicesFile;
    try {
      if (typeof servicesPath !== 'string' || !servicesPath)
        throw new Error('Missing Firebase configuration');
      /** @type {unknown} */
      const rawServices = JSON.parse(readFileSync(resolve(servicesPath), 'utf8'));
      const services = object(rawServices);
      if (
        !object(services.project_info).project_number ||
        !Array.isArray(services.client) ||
        !services.client.some(
          (client) =>
            object(object(object(client).client_info).android_client_info).package_name ===
            android.package,
        )
      )
        throw new Error('Firebase configuration does not match the Android app');
    } catch {
      errors.push(
        'GOOGLE_SERVICES_JSON must point to a Firebase google-services.json for com.dwd.app. Also configure FCM v1 credentials in EAS.',
      );
    }
  }
}
if (errors.length) {
  console.error(
    `Mobile build configuration missing or invalid:\n${errors.join('\n')}\nSet these variables in the EAS environment used by this profile (testing uses preview).`,
  );
  process.exitCode = 1;
} else {
  console.log('Mobile build configuration verified.');
}
