'use client';

import { useRef, useState } from 'react';
import {
  COUNTRY_PROFILES,
  UK_CALENDAR_REGIONS,
  defaultCalendarRegion,
  isCountryCode,
  isCalendarRegion,
  type PreplotPreferences,
} from '@dwd/core';
import { Button } from '@/components/ui/button';
import { updatePreplotCountryAction } from '@/features/notifications/actions';

export function CountrySettings({ initial }: { initial: PreplotPreferences }) {
  const [country, setCountry] = useState(initial.countryCode);
  const [countryChosen, setCountryChosen] = useState(initial.countrySelected);
  const [region, setRegion] = useState(initial.calendarRegion);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const result = await updatePreplotCountryAction({
        countryCode: country,
        calendarRegion: region,
      });
      if (!result.ok) throw new Error(result.error);
      setMessage('Country saved.');
    } catch {
      setFailed(true);
      setMessage('Country could not be saved. Retry.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="campaign-country">Country & holidays</label>
        <select
          id="campaign-country"
          className="input"
          value={countryChosen ? country : ''}
          disabled={busy}
          onChange={(event) => {
            const code = event.target.value;
            if (isCountryCode(code)) {
              setCountry(code);
              setCountryChosen(true);
              setRegion(defaultCalendarRegion(code));
              setMessage(null);
            }
          }}
        >
          <option value="" disabled>
            Choose your country
          </option>
          {COUNTRY_PROFILES.map((profile) => (
            <option value={profile.code} key={profile.code}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>
      {country === 'GB' ? (
        <div className="field">
          <label htmlFor="holiday-region">Holiday calendar</label>
          <select
            id="holiday-region"
            className="input"
            value={region}
            disabled={busy}
            onChange={(event) => {
              if (isCalendarRegion(country, event.target.value)) {
                setRegion(event.target.value);
                setMessage(null);
              }
            }}
          >
            {UK_CALENDAR_REGIONS.map((choice) => (
              <option key={choice.code} value={choice.code}>
                {choice.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <p className="muted small">
        Mobile reminders use your device&apos;s local time. Choose your current country separately
        in Help.
      </p>
      {country === 'US' || country === 'CA' ? (
        <p className="muted small">Holiday reminders use the federal calendar.</p>
      ) : null}
      <Button type="button" disabled={busy || !countryChosen} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save country'}
      </Button>
      {message ? (
        <p role={failed ? 'alert' : 'status'} className={failed ? 'error-box' : 'muted small'}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
