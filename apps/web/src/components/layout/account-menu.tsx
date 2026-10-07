'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight, History, MessageCircle, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { TourButton } from '@/features/tour/tour-provider';

export function AccountMenu({ name }: { name: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current)
        menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  return (
    <details
      className="account-menu"
      ref={menu}
      onBlur={(event) => {
        // Safari can blur the summary without focusing a pressed button. Let
        // that click finish; outside pointer presses already close the menu.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
    >
      <summary
        aria-label="Account menu"
        onPointerDown={() => {
          if (menu.current) menu.current.dataset['motion'] = 'pointer';
        }}
        onKeyDown={(event) => {
          const currentMenu = menu.current;
          if (!currentMenu) return;
          currentMenu.dataset['motion'] = 'instant';
          // Enter an open menu consistently, including Safari's link-focus mode.
          if (event.key === 'Tab' && !event.shiftKey && currentMenu.open) {
            event.preventDefault();
            currentMenu
              .querySelector<HTMLElement>('nav a[href], nav button:not(:disabled)')
              ?.focus();
          }
        }}
      >
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name small">{name}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="account-popover">
        <div className="account-popover-profile">
          <span className="avatar" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <strong>{name}</strong>
        </div>
        <nav
          aria-label="Your account"
          onClick={() => {
            if (menu.current) menu.current.open = false;
          }}
        >
          <Link href="/history">
            <History size={19} aria-hidden="true" />
            <span>Night history</span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/account">
            <UserRound size={19} aria-hidden="true" />
            <span>Your account</span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/feedback">
            <MessageCircle size={19} aria-hidden="true" />
            <span>Feedback & support</span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
          <TourButton className="account-tour-button" />
        </nav>
        <div className="account-popover-footer">
          <SignOutButton />
        </div>
      </div>
    </details>
  );
}
