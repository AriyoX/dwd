'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const dismissalKey = 'dwd-install-hint-dismissed';

export function InstallHint({ enabled }: { enabled: boolean }) {
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'mac' | 'other'>('other');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)');
    const detect = () =>
      setInstalled(
        standalone.matches || ('standalone' in navigator && navigator.standalone === true),
      );
    queueMicrotask(() => {
      detect();
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      setPlatform(
        ios
          ? 'ios'
          : /Android/.test(navigator.userAgent)
            ? 'android'
            : /Macintosh/.test(navigator.userAgent)
              ? 'mac'
              : 'other',
      );
      try {
        setDismissed(localStorage.getItem(dismissalKey) === 'true');
      } catch {
        setDismissed(false);
      }
    });
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    standalone.addEventListener('change', detect);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
      standalone.removeEventListener('change', detect);
    };
  }, []);
  if (!enabled || dismissed || installed) return null;
  const instructions =
    platform === 'ios'
      ? 'Tap Share, then Add to Home Screen.'
      : platform === 'android'
        ? 'Open your browser menu and choose Add to home screen or Install app.'
        : platform === 'mac'
          ? 'In Safari, choose File → Add to Dock. In Chrome, use the install icon in the address bar.'
          : 'In Chrome or Edge, use the install icon in the address bar or the browser menu.';
  return (
    <aside className="install-hint" aria-label="Add DWD to your home screen">
      <Download size={20} aria-hidden="true" />
      <div>
        <strong>Add DWD to your home screen</strong>
        <p className="muted small">
          {prompt ? 'Open it like an app, straight from your home screen.' : instructions}
        </p>
        {prompt && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                if (choice.outcome === 'accepted') setInstalled(true);
              } catch {
                /* Keep browser-menu instructions available. */
              } finally {
                setPrompt(null);
                setBusy(false);
              }
            }}
          >
            {busy ? 'Opening…' : 'Install app'}
          </button>
        )}
      </div>
      <button
        type="button"
        className="button-icon"
        aria-label="Dismiss install tip"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(dismissalKey, 'true');
          } catch {
            /* Dismiss for this visit. */
          }
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
