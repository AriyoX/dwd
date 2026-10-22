'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { QuickLogEntry } from './entry-point';
import styles from './quick-log.module.css';

const seen = new Set<string>();

export function QuickLogSuggestion({ accountId }: { accountId?: string }) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const evaluated = useRef<string | null>(null);
  const key = `dwd.quick-log.suggestion.v1:${accountId ?? 'guest'}`;

  useEffect(() => {
    if (evaluated.current === key) return;
    evaluated.current = key;
    let dismissed = seen.has(key);
    try {
      dismissed ||= localStorage.getItem(key) === 'seen';
      localStorage.setItem(key, 'seen');
    } catch {
      // Still show this at most once per visit when device storage is unavailable.
    }
    seen.add(key);
    queueMicrotask(() => setVisible(!dismissed));
  }, [key]);

  useEffect(() => {
    if (!visible || hovered || focused) return;
    const timer = setTimeout(() => setVisible(false), 15000);
    return () => clearTimeout(timer);
  }, [visible, hovered, focused]);

  if (!visible) return null;
  return (
    <aside
      className={styles['suggestion']}
      aria-label="Quick Log suggestion"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setVisible(false);
      }}
    >
      <div className={styles['suggestionHeading']}>
        <span>Just keeping count?</span>
        <button
          className="button button-ghost"
          type="button"
          aria-label="Dismiss Quick Log suggestion"
          onClick={() => setVisible(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div onClick={() => setVisible(false)}>
        <QuickLogEntry label="Log now" {...(accountId ? { accountId } : {})} />
      </div>
    </aside>
  );
}
