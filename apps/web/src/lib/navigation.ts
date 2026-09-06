export function safeReturnPath(value: string | null | undefined, fallback = '/home'): string {
  if (value === undefined || value === null) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const parsed = new URL(value, 'https://dwd.invalid');
    if (parsed.origin !== 'https://dwd.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
