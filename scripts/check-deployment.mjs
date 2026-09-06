const errors = [];
const backend = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const site = process.env.NEXT_PUBLIC_SITE_URL;

try {
  const url = new URL(backend);
  if (
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    errors.push('Set NEXT_PUBLIC_SUPABASE_URL to the dedicated hosted Drink with Desire project URL.');
  }
  if (['roddypqhsgiamymfvool', 'ydtxgwlnldfuqamhxfqi'].includes(url.hostname.split('.')[0] ?? '')) {
    errors.push('The selected backend belongs to Baby Steps. Use a separate Drink with Desire project.');
  }
} catch {
  errors.push('Set NEXT_PUBLIC_SUPABASE_URL to the dedicated hosted Drink with Desire project URL.');
}

if (!key.startsWith('sb_publishable_') || key.includes('REPLACE_ME') || key.length < 25) {
  errors.push('Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the project’s publishable key.');
}

if (site) {
  try {
    const url = new URL(site);
    if (
      url.protocol !== 'https:' ||
      ['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      errors.push('NEXT_PUBLIC_SITE_URL must be an HTTPS origin, without a path or credentials.');
    }
  } catch {
    errors.push('NEXT_PUBLIC_SITE_URL is not a valid HTTPS origin.');
  }
} else if (!process.env.VERCEL_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  errors.push('Set NEXT_PUBLIC_SITE_URL, or run inside Vercel with its deployment URL available.');
}

if (errors.length > 0) {
  console.error(
    `Deployment configuration needs attention:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log('Deployment configuration passed. No secret key is required by the app.');
}
