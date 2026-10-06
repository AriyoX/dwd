import { describe, expect, it } from 'vitest';
import { countryFromCoordinates, DEFAULT_COUNTRY_LOCATION } from '@dwd/core';

describe('private on-device country detection', () => {
  it.each([
    ['UG', 0.3476, 32.5825, 'national'],
    ['KE', -1.2921, 36.8219, 'national'],
    ['TZ', -6.7924, 39.2083, 'national'],
    ['RW', -1.9441, 30.0619, 'national'],
    ['ZA', -26.2041, 28.0473, 'national'],
    ['AE', 25.2048, 55.2708, 'national'],
    ['GB', 51.5074, -0.1278, 'england-and-wales'],
    ['GB', 55.9533, -3.1883, 'scotland'],
    ['GB', 54.5973, -5.9301, 'northern-ireland'],
    ['GB', 51.4816, -3.1791, 'england-and-wales'],
    ['US', 40.7128, -74.006, 'national'],
    ['US', 21.3099, -157.8581, 'national'],
    ['CA', 43.6532, -79.3832, 'national'],
  ])(
    'detects %s at %s,%s without a network geocoder',
    (countryCode, latitude, longitude, calendarRegion) => {
      expect(countryFromCoordinates(latitude, longitude)).toEqual({
        countryCode,
        calendarRegion,
        source: 'location',
      });
    },
  );
  it.each([
    [NaN, 0],
    [0, Infinity],
    [91, 0],
    [0, 181],
    [0, 0],
    [6.5244, 3.3792],
    [53.3498, -6.2603],
  ])('defaults to Uganda for invalid/unavailable/unsupported location %s,%s', (lat, lon) => {
    expect(countryFromCoordinates(lat, lon)).toEqual(DEFAULT_COUNTRY_LOCATION);
  });
});
