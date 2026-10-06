import profiles from './countries.json';

export type CountryCode = 'UG' | 'KE' | 'TZ' | 'RW' | 'ZA' | 'AE' | 'GB' | 'US' | 'CA';
export type CalendarRegion = 'national' | 'england-and-wales' | 'scotland' | 'northern-ireland';
export const UK_CALENDAR_REGIONS = [
  { code: 'england-and-wales', name: 'England & Wales' },
  { code: 'scotland', name: 'Scotland' },
  { code: 'northern-ireland', name: 'Northern Ireland' },
] as const;
export const COUNTRY_PROFILES = profiles;
export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && profiles.some((profile) => profile.code === value);
}
export function countryProfile(code: string | null | undefined) {
  return profiles.find((profile) => profile.code === code) ?? null;
}
export function defaultCalendarRegion(code: CountryCode): CalendarRegion {
  return code === 'GB' ? 'england-and-wales' : 'national';
}
export function isCalendarRegion(code: CountryCode, region: unknown): region is CalendarRegion {
  return code === 'GB'
    ? UK_CALENDAR_REGIONS.some((choice) => choice.code === region)
    : region === 'national';
}
export function emergencyDialUri(code: string | null, number: string): string | null {
  return countryProfile(code)?.emergency.some((contact) => contact.number === number)
    ? `tel:${number}`
    : null;
}
export const HELP_COUNTRY_KEY = 'dwd.help.current-country.v1';
export interface CountryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readHelpCountry(storage: CountryStorage): CountryCode | null {
  try {
    const saved = storage.getItem(HELP_COUNTRY_KEY);
    return isCountryCode(saved) ? saved : null;
  } catch {
    return null;
  }
}
export function saveHelpCountry(storage: CountryStorage, code: CountryCode | null): boolean {
  try {
    storage.setItem(HELP_COUNTRY_KEY, code ?? '');
    return true;
  } catch {
    return false;
  }
}
