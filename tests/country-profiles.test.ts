import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_PROFILES,
  HELP_COUNTRY_KEY,
  countryProfile,
  emergencyDialUri,
  isCalendarRegion,
  isCountryCode,
  readHelpCountry,
  saveHelpCountry,
} from '@dwd/core';

describe('country profiles and offline emergency help', () => {
  it('prioritizes the five African profiles while including every requested destination', () => {
    expect(COUNTRY_PROFILES.map((profile) => profile.code)).toEqual([
      'UG',
      'KE',
      'TZ',
      'RW',
      'ZA',
      'AE',
      'GB',
      'US',
      'CA',
    ]);
    expect(COUNTRY_PROFILES.slice(0, 5).every((profile) => profile.priority === 'africa')).toBe(
      true,
    );
    expect(countryProfile('AE')?.name).toBe('Dubai / UAE');
  });
  it.each([
    ['UG', ['112', '999']],
    ['KE', ['999', '112', '911']],
    ['TZ', ['112', '114']],
    ['RW', ['912', '112']],
    ['ZA', ['112', '10177', '10111']],
    ['AE', ['998', '999', '997']],
    ['GB', ['999', '112']],
    ['US', ['911']],
    ['CA', ['911']],
  ])('uses verified local short numbers for %s', (code, expected) => {
    const profile = countryProfile(code);
    expect(profile?.emergency.map((contact) => contact.number)).toEqual(expected);
    expect(profile?.emergencySource).toMatch(/^https:\/\//);
    for (const number of expected) expect(emergencyDialUri(code, number)).toBe(`tel:${number}`);
  });
  it('does not fall back to Uganda or dial unverified numbers', () => {
    expect(countryProfile('XX')).toBeNull();
    expect(emergencyDialUri(null, '112')).toBeNull();
    expect(emergencyDialUri('TZ', '999')).toBeNull();
    expect(emergencyDialUri('AE', '+971998')).toBeNull();
    expect(emergencyDialUri('KE', '112;javascript:alert(1)')).toBeNull();
  });
  it('requires explicit supported country and a valid UK nation', () => {
    expect(isCountryCode('UK')).toBe(false);
    expect(isCountryCode('GB')).toBe(true);
    expect(isCalendarRegion('GB', 'scotland')).toBe(true);
    expect(isCalendarRegion('GB', 'national')).toBe(false);
    expect(isCalendarRegion('KE', 'scotland')).toBe(false);
  });
  it('restores Help offline and clears a previous country for unsupported destinations', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(readHelpCountry(storage)).toBeNull();
    expect(saveHelpCountry(storage, 'RW')).toBe(true);
    expect(readHelpCountry(storage)).toBe('RW');
    expect(saveHelpCountry(storage, null)).toBe(true);
    expect(readHelpCountry(storage)).toBeNull();
    values.set(HELP_COUNTRY_KEY, 'Unknown');
    expect(readHelpCountry(storage)).toBeNull();
  });
  it('recovers from inaccessible local storage without choosing a fallback country', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readHelpCountry(storage)).toBeNull();
    expect(saveHelpCountry(storage, 'ZA')).toBe(false);
  });
  it('keeps the server market seed consistent with the bundled registry', () => {
    const sql = readFileSync(
      'supabase/migrations/20261006080503_country_campaigns_and_emergency_help.sql',
      'utf8',
    );
    const seed = sql.split('$profiles$')[1];
    expect(seed).toBeDefined();
    expect(JSON.parse(seed ?? 'null')).toEqual(COUNTRY_PROFILES);
  });
});
