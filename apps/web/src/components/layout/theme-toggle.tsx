'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AppearancePicker } from './appearance-picker';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset['theme'] === 'dark');
    queueMicrotask(sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <details className="appearance-menu theme-toggle">
      <summary className="button button-secondary" aria-label="Change appearance">
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span>{dark ? 'Light' : 'Dark'}</span>
      </summary>
      <div className="appearance-popover">
        <AppearancePicker />
      </div>
    </details>
  );
}
