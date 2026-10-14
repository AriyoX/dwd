'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Plus, Moon } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
export function StartTonight() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button data-tour="start" type="button" onClick={() => setOpen(true)}>
        <Plus size={19} aria-hidden="true" />
        Start Tonight
        <ArrowRight size={18} aria-hidden="true" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Start Tonight">
        <Link className="card stack start-choice" href="/quick-log?scope=account">
          <Plus size={26} aria-hidden="true" />
          <h3>Quick Log</h3>
          <strong>Just keeping count?</strong>
          <p className="muted small">Log your drinks. No planning or setup.</p>
        </Link>
        <Link className="card stack start-choice" href="/night/new">
          <Moon size={26} aria-hidden="true" />
          <h3>Plan a Night</h3>
          <strong>Make a night of it.</strong>
          <p className="muted small">Set up your night, track in detail and invite your mates.</p>
        </Link>
      </Dialog>
    </>
  );
}
