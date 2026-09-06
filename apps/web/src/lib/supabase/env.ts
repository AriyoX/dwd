import { resolveSiteUrl } from '../site-url';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const supabasePublishableKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

export function getSupabaseEnvironment(): { url: string; publishableKey: string } {
  if (
    !supabaseUrl ||
    !supabasePublishableKey ||
    supabaseUrl.includes('YOUR_') ||
    supabasePublishableKey.includes('REPLACE_ME')
  ) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.',
    );
  }
  return { url: supabaseUrl, publishableKey: supabasePublishableKey };
}

export function getSiteUrl(): string {
  return resolveSiteUrl(process.env);
}
