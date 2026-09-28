'use client';

import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { usePwaRuntime } from './pwa-runtime';

export function InstallHint({ enabled }: { enabled: boolean }) {
  const runtime = usePwaRuntime();
  const [showInstructions, setShowInstructions] = useState(false);
  if (!enabled || !runtime.ready || runtime.installed || runtime.installDismissed) return null;
  return (
    <aside className="install-hint" aria-label="Install dwd">
      <Download size={20} aria-hidden="true" />
      <div className="stack">
        <strong>Get reminders during your night</strong>
        <p className="muted small">
          Install dwd so reminders can reach you when the app isn&apos;t open.
        </p>
        {showInstructions ? (
          <ol className="compact-list">
            {runtime.manualInstructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        <button
          type="button"
          className="text-link"
          onClick={async () => {
            const result = await runtime.install();
            if (result === 'manual' || result === 'unavailable') setShowInstructions(true);
          }}
        >
          Install dwd
        </button>
      </div>
      <button
        type="button"
        className="button-icon"
        aria-label="Not now"
        onClick={() => runtime.dismissInstall()}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
