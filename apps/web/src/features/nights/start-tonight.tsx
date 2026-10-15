'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Plus, Moon } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import styles from './start-tonight.module.css';
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
        <Link className={`${styles['choice']} ${styles['quick']}`} href="/quick-log?scope=account">
          <span className={styles['icon']}>
            <Plus size={26} aria-hidden="true" />
          </span>
          <span className={styles['label']}>
            <strong>Quick Log</strong>
            <span className="muted small">Keep count. No setup.</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <Link className={styles['choice']} href="/night/new">
          <span className={styles['icon']}>
            <Moon size={26} aria-hidden="true" />
          </span>
          <span className={styles['label']}>
            <strong>Plan a Night</strong>
            <span className="muted small">Detailed tracking with your mates.</span>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </Dialog>
    </>
  );
}
