import boundaries from './country-boundaries.json';
import { type CalendarRegion, type CountryCode } from './countries';

export interface CountryLocation {
  countryCode: CountryCode;
  calendarRegion: CalendarRegion;
  source: 'location' | 'default';
}

export const DEFAULT_COUNTRY_LOCATION: CountryLocation = {
  countryCode: 'UG',
  calendarRegion: 'national',
  source: 'default',
};

// Coordinates are only used in memory. No reverse-geocoding service or coordinate storage.
function inRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue;
    if (
      ay > latitude !== by > latitude &&
      longitude < ((bx - ax) * (latitude - ay)) / (by - ay) + ax
    )
      inside = !inside;
  }
  return inside;
}

export function countryFromCoordinates(latitude: number, longitude: number): CountryLocation {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return DEFAULT_COUNTRY_LOCATION;
  for (const boundary of boundaries) {
    if (
      boundary.polygons.some((polygon) => {
        const outer = polygon[0];
        return Boolean(
          outer &&
          inRing(longitude, latitude, outer) &&
          !polygon.slice(1).some((hole) => inRing(longitude, latitude, hole)),
        );
      })
    ) {
      return {
        countryCode: boundary.country as CountryCode,
        calendarRegion: boundary.region as CalendarRegion,
        source: 'location',
      };
    }
  }
  return DEFAULT_COUNTRY_LOCATION;
}

export const LOCATION_DISCLOSURE =
  'DWD uses optional device location for local holiday reminders and emergency numbers. Coordinates stay on this device; only your country and holiday region are saved to your account. Without location access, DWD uses Uganda.';
