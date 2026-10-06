'use client';
import { countryProfile, LOCATION_DISCLOSURE } from '@dwd/core';
import { useCountryLocation } from '@/providers/location-provider';

export function CountrySettings() {
  const { location, permission, enabled, busy, request, disable } = useCountryLocation();
  const usingLocation = enabled && permission === 'granted';
  return (
    <section className="stack notification-options" aria-label="Location settings">
      <label className="row-between">
        <strong>Use location</strong>
        <input
          type="checkbox"
          role="switch"
          checked={enabled && (busy || usingLocation)}
          onChange={(event) => (event.target.checked ? request() : disable())}
        />
      </label>
      <p className="muted small">{LOCATION_DISCLOSURE} Turn off anytime.</p>
      <p className="small" role="status">
        {busy
          ? 'Finding country…'
          : `${usingLocation ? 'On' : 'Off'} · ${countryProfile(location.countryCode)?.name}${location.source === 'default' ? ' (default)' : ''}`}
      </p>
      {enabled && permission === 'denied' ? (
        <p className="small">Allow location in your browser settings to turn it on.</p>
      ) : null}
      {enabled && permission === 'unavailable' ? (
        <button type="button" className="text-link" onClick={request}>
          Retry location
        </button>
      ) : null}
    </section>
  );
}
