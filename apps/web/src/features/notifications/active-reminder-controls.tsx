'use client';

import { BellRing, Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NotificationPreferences } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { BrowserNotificationSettings } from './browser-notification-settings';
import { setReminderPauseAction, updateNotificationPreferencesAction } from './actions';
import { useReminderPause } from './use-reminder-pause';

export function ActiveReminderControls({ initial }: { initial: NotificationPreferences }) {
  const [preferences, setPreferences] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const muted = useReminderPause(preferences.remindersMutedUntil);

  async function save(next: NotificationPreferences) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await updateNotificationPreferencesAction(next);
      if (result.ok) {
        setPreferences(result.data);
        setMessage(next.periodicWaterEnabled ? 'Check-ins are on.' : 'Check-ins are off.');
      } else setMessage(result.error);
    } catch {
      setMessage('Reminders could not be saved. Retry when connected.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function pause(minutes: 60 | null) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await setReminderPauseAction(minutes);
      if (result.ok) {
        setPreferences(result.data);
        setMessage(minutes === null ? 'Reminders resumed.' : 'Reminders paused for 1 hour.');
      } else setMessage(result.error);
    } catch {
      setMessage('Reminders could not be saved. Retry when connected.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="stack reminder-card" aria-labelledby="active-reminders">
      <div className="row-between">
        <div>
          <h2 id="active-reminders">Keep me on track</h2>
          <p className="muted small">Get a check-in if you have not updated the night.</p>
        </div>
        <BellRing size={22} aria-hidden="true" />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={preferences.periodicWaterEnabled}
          disabled={busy}
          onChange={() =>
            void save({ ...preferences, periodicWaterEnabled: !preferences.periodicWaterEnabled })
          }
        />
        Remind me to log
      </label>
      {preferences.periodicWaterEnabled ? (
        <>
          <div className="field">
            <label htmlFor="active-reminder-interval">Check-in interval</label>
            <select
              id="active-reminder-interval"
              className="select"
              disabled={busy}
              value={preferences.periodicIntervalMinutes}
              onChange={(event) =>
                void save({
                  ...preferences,
                  periodicIntervalMinutes: Number(event.target.value) as 15 | 30 | 45 | 60,
                })
              }
            >
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="45">Every 45 minutes</option>
              <option value="60">Every hour</option>
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void pause(muted ? null : 60)}
          >
            {muted ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
            {muted ? 'Resume reminders' : 'Pause for 1 hour'}
          </Button>
        </>
      ) : null}
      {message ? (
        <p className="muted small" role="status">
          {message}
        </p>
      ) : null}
      <details>
        <summary>Notification setup</summary>
        <BrowserNotificationSettings />
      </details>
    </section>
  );
}
