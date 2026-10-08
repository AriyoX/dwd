'use client';

import { Moon, Smartphone, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { darkTheme, lightTheme } from '@dwd/core';

type Preference = 'system' | 'light' | 'dark';
const changeEvent = 'dwd:appearance';
let unpersistedPreference: Preference | undefined;

function readPreference(): Preference {
  if (unpersistedPreference) return unpersistedPreference;
  try {
    const saved = localStorage.getItem('dwd-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyPreference(preference: Preference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? darkTheme.background : lightTheme.background);
}

export function AppearancePicker() {
  const [preference, setPreference] = useState<Preference>('system');
  useEffect(() => {
    const sync = () => {
      const value = readPreference();
      setPreference(value);
      applyPreference(value);
    };
    queueMicrotask(sync);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      if (readPreference() === 'system') applyPreference('system');
    };
    media.addEventListener('change', followSystem);
    window.addEventListener(changeEvent, sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', followSystem);
      window.removeEventListener(changeEvent, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <fieldset className="appearance-picker">
      <legend className="visually-hidden">Appearance</legend>
      {(
        [
          { value: 'system', label: 'System', icon: Smartphone },
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
        ] as const
      ).map(({ value, label, icon: Icon }) => {
        const selected = preference === value;
        return (
          <button
            type="button"
            key={value}
            aria-label={`${label} appearance`}
            aria-pressed={selected}
            className={selected ? 'active' : ''}
            onClick={() => {
              setPreference(value);
              applyPreference(value);
              try {
                localStorage.setItem('dwd-theme', value);
                unpersistedPreference = undefined;
              } catch {
                unpersistedPreference = value;
              }
              window.dispatchEvent(new Event(changeEvent));
            }}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
