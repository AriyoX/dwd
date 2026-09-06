'use client';

import { Phone, TriangleAlert } from 'lucide-react';
import { EMERGENCY_NUMBERS_UGANDA, EMERGENCY_SIGNS } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function EmergencyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        {EMERGENCY_NUMBERS_UGANDA.map((number) => (
          <a className="button button-danger" href={`tel:${number}`} key={number}>
            <Phone aria-hidden="true" size={20} /> Call {number}
          </a>
        ))}
      </div>
      <Button type="button" variant="secondary" full onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}
