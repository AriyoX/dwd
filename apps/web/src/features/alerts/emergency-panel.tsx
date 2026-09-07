'use client';

import { Phone, TriangleAlert } from 'lucide-react';
import { EMERGENCY_NUMBERS_UGANDA, EMERGENCY_SIGNS } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function EmergencyPanel({
  open,
  onClose,
  practice = false,
}: {
  open: boolean;
  onClose: () => void;
  practice?: boolean;
}) {
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
      <p className="muted small">
        Uganda emergency numbers, last verified against the Uganda Police Force website on 31 July
        2026. Confirm again before production release.
      </p>
      <div className="field-grid">
        {EMERGENCY_NUMBERS_UGANDA.map((number) =>
          practice ? (
            <button className="button button-danger" type="button" disabled key={number}>
              <Phone aria-hidden="true" size={20} /> Call {number}
            </button>
          ) : (
            <a className="button button-danger" href={`tel:${number}`} key={number}>
              <Phone aria-hidden="true" size={20} /> Call {number}
            </a>
          ),
        )}
      </div>
      {practice && <p className="muted small">Calls are off during the tour.</p>}
      <Button type="button" variant="secondary" full onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}
