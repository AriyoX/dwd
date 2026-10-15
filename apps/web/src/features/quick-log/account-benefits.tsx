'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Camera, Clock3, CalendarDays, Users } from 'lucide-react';
import { quickAccountBenefits } from '@dwd/core';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import styles from './quick-log.module.css';

export function AccountBenefits({
  next,
  label = 'Sign in / Create account',
  beforeAuth,
  retrySaving,
}: {
  next: string;
  label?: string;
  beforeAuth?: () => string | null;
  retrySaving?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const check = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const error = beforeAuth?.();
    if (error) {
      event.preventDefault();
      setIssue(error);
    }
  };
  const icons = [Clock3, Camera, CalendarDays, Users];
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save your nights">
        <ul className={styles['benefits']}>
          {quickAccountBenefits.map((benefit, index) => {
            const Icon = icons[index] ?? Users;
            return (
              <li key={benefit}>
                <Icon size={22} aria-hidden="true" />
                <span>{benefit}</span>
              </li>
            );
          })}
        </ul>
        <Link
          className="button button-primary"
          href={`/login?next=${encodeURIComponent(next)}`}
          onClick={check}
        >
          Sign in
        </Link>
        <Link
          className="button button-secondary"
          href={`/signup?next=${encodeURIComponent(next)}`}
          onClick={check}
        >
          Create account
        </Link>
        {issue ? (
          <div className="error-box" role="alert">
            {issue}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                retrySaving?.();
                setIssue(beforeAuth?.() ?? null);
              }}
            >
              Retry saving
            </Button>
          </div>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep logging as a guest
        </Button>
      </Dialog>
    </>
  );
}

export function GetApp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Get the App
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="DWD on your phone">
        <a className="button button-primary" href="dwd://quick-log">
          Open the installed DWD app
        </a>
        <p>Or add this site to your home screen from your browser’s Share or menu options.</p>
        <p className="muted small">Sign in here first to carry your logs to the app.</p>
      </Dialog>
    </>
  );
}
