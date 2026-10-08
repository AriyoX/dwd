'use client';

import { Phone, TriangleAlert } from 'lucide-react';
import { countryProfile, emergencyDialUri, EMERGENCY_SIGNS } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useCountryLocation } from '@/providers/location-provider';

export function EmergencyPanel({
  open,
  onClose,
  practice = false,
}: {
  open: boolean;
  onClose: () => void;
  practice?: boolean;
}) {
  const { location } = useCountryLocation();
  const country = location.countryCode;
  const profile = countryProfile(country);
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
            <TriangleAlert aria-hidden="true" size={18} color="var(--muted)" />
            <span>{sign}</span>
          </div>
        ))}
      </div>
      <strong>
        {profile?.name}
        {location.source === 'default' ? ' (default)' : ''}
      </strong>
      <p className="muted small">
        {location.source === 'default'
          ? 'Location is unavailable or unsupported. These numbers are for Uganda. If you are elsewhere, dial your local emergency number or ask someone nearby.'
          : 'Location is approximate. Check that these emergency numbers apply where you are.'}
      </p>
      <p className="muted small">A DWD check-in does not call emergency services.</p>
      {!profile ? (
        <p className="muted small">
          Use your local emergency number or ask someone nearby for help.
        </p>
      ) : null}
      <div className="field-grid">
        {profile?.emergency.map(({ number, service }) =>
          practice ? (
            <button className="button button-primary" type="button" disabled key={number}>
              <Phone aria-hidden="true" size={20} /> Call {number} · {service}
            </button>
          ) : (
            <a
              className="button button-primary"
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
