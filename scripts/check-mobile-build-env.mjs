// EAS runs this before bundling: an APK without these values cannot sign in.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const errors = [];
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
if (errors.length) {
  console.error(
    `Mobile build configuration missing or invalid:\n${errors.join('\n')}\nSet these variables in the EAS environment used by this profile (testing uses preview).`,
  );
  process.exitCode = 1;
} else {
  console.log('Mobile account configuration verified.');
}
