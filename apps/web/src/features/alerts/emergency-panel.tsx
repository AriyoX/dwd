'use client';

import { Phone, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  COUNTRY_PROFILES,
  countryProfile,
  emergencyDialUri,
  EMERGENCY_SIGNS,
  isCountryCode,
  readHelpCountry,
  saveHelpCountry,
  type CountryCode,
} from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

const helpStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};

export function EmergencyPanel({
  open,
  onClose,
  practice = false,
}: {
  open: boolean;
  onClose: () => void;
  practice?: boolean;
}) {
  const [country, setCountry] = useState<CountryCode | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const profile = countryProfile(country);
  useEffect(() => {
    if (open)
      queueMicrotask(() => {
        setCountry(readHelpCountry(helpStorage));
        setIssue(null);
      });
  }, [open]);
  return (
    <Dialog
      open={open}
      urgent
      title="Someone needs help"
      description="Do not leave the person alone. Seek emergency help immediately."
      onClose={onClose}
    >
      <div className="warning-signs">
        {EMERGENCY_SIGNS.map((sign) => (
          <div className="row" key={sign}>
            <TriangleAlert aria-hidden="true" size={18} color="var(--red)" />
            <span>{sign}</span>
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor="help-country">Current country</label>
        <select
          id="help-country"
          className="input"
          value={country ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            const code = isCountryCode(value) ? value : null;
            setCountry(code);
            setIssue(
              saveHelpCountry(helpStorage, code)
                ? null
                : 'Country could not be saved. Choose it again next time.',
            );
          }}
        >
          <option value="">Choose your country</option>
          {COUNTRY_PROFILES.map((choice) => (
            <option key={choice.code} value={choice.code}>
              {choice.name}
            </option>
          ))}
          <option value="unsupported">My country isn&apos;t listed</option>
        </select>
      </div>
      <p className="muted small">
        Confirm your current country before calling. A DWD check-in does not call emergency
        services.
      </p>
      {!profile ? (
        <p className="muted small">
          Use your local emergency number or ask someone nearby for help.
        </p>
      ) : null}
      {issue ? (
        <p className="error-box" role="alert">
          {issue}
        </p>
      ) : null}
      <div className="field-grid">
        {profile?.emergency.map(({ number, service }) =>
          practice ? (
            <button className="button button-danger" type="button" disabled key={number}>
              <Phone aria-hidden="true" size={20} /> Call {number} · {service}
            </button>
          ) : (
            <a
              className="button button-danger"
              href={emergencyDialUri(country, number) ?? undefined}
              key={number}
            >
              <Phone aria-hidden="true" size={20} /> Call {number} · {service}
            </a>
          ),
        )}
      </div>
      {profile ? (
        <p className="muted small">
          Numbers verified {profile.reviewedAt} ·{' '}
          <a className="text-link" href={profile.emergencySource} target="_blank" rel="noreferrer">
            {profile.emergencyAuthority}
          </a>
        </p>
      ) : null}
      {practice && <p className="muted small">Calls are off during the tour.</p>}
      <Button type="button" variant="secondary" full onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}
