'use client';

import { useEffect, useRef, useState } from 'react';
import type { NotificationEvent, NotificationPreferences } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { updateDisplayNameAction } from './actions';
import { updateNotificationPreferencesAction } from '@/features/notifications/actions';
import { BrowserNotificationSettings } from '@/features/notifications/browser-notification-settings';
import { NotificationInbox } from '@/features/notifications/notification-inbox';

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setReady(true));
  }, []);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('saving');
    setError(null);
    try {
      const result = await updateDisplayNameAction({ displayName: name.trim() });
      if (result.ok) {
        setSavedName(result.displayName);
        setName(result.displayName);
        setState('saved');
      } else {
        setState('error');
        setError(result.error);
      }
    } catch {
      setState('error');
      setError('Your name could not be saved. Retry without leaving this page.');
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          className="input"
          maxLength={60}
          disabled={!ready || state === 'saving'}
          aria-invalid={state === 'error'}
          aria-describedby={state === 'error' ? 'display-name-error' : undefined}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setState('idle');
          }}
        />
        {state === 'error' ? (
          <p className="error-box" id="display-name-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="row">
        <Button
          type="button"
          disabled={
            !ready || state === 'saving' || (name.trim() === savedName && name.trim() !== '')
          }
          onClick={() => void save()}
        >
          {state === 'saving' ? 'Saving…' : 'Save name'}
        </Button>
        {state === 'saved' ? (
          <span className="muted small" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function NotificationSettings({
  initialPreferences,
  initialEvents,
}: {
  initialPreferences: NotificationPreferences;
  initialEvents: NotificationEvent[];
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [saveError, setSaveError] = useState(false);
  async function save(next: NotificationPreferences) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveError(false);
    const previous = preferences;
    setPreferences(next);
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateNotificationPreferencesAction(next);
      if (result.ok) {
        setPreferences(result.data);
        setMessage('Saved');
      } else {
        setSaveError(true);
        setPreferences(previous);
        setMessage(result.error);
      }
    } catch {
      setSaveError(true);
      setPreferences(previous);
      setMessage('Notification settings could not be saved. Retry.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function toggle(
    key: keyof Pick<
      NotificationPreferences,
      | 'groupAttentionEnabled'
      | 'directCheckinsEnabled'
      | 'personalPaceEnabled'
      | 'plannedEndEnabled'
      | 'periodicWaterEnabled'
    >,
  ) {
    const next = { ...preferences, [key]: !preferences[key] };
    void save(next);
  }

  return (
    <>
      <section className="stack" id="notifications">
        <h2>Notifications</h2>
        <p className="muted small">
          Choose which updates appear in DWD and on your enabled devices.
        </p>
        <BrowserNotificationSettings />
        <fieldset className="notification-options">
          <legend>Your group</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.groupAttentionEnabled}
              disabled={saving}
              onChange={() => toggle('groupAttentionEnabled')}
            />{' '}
            Group attention
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.directCheckinsEnabled}
              disabled={saving}
              onChange={() => toggle('directCheckinsEnabled')}
            />{' '}
            Direct check-ins
          </label>
        </fieldset>
        <fieldset className="notification-options">
          <legend>Your reminders</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.personalPaceEnabled}
              disabled={saving}
              onChange={() => toggle('personalPaceEnabled')}
            />{' '}
            Personal pace reminders
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.plannedEndEnabled}
              disabled={saving}
              onChange={() => toggle('plannedEndEnabled')}
            />{' '}
            Planned-end reminder
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.periodicWaterEnabled}
              disabled={saving}
              onChange={() => toggle('periodicWaterEnabled')}
            />{' '}
            Periodic check-in reminder
          </label>
          {preferences.periodicWaterEnabled ? (
            <div className="field">
              <label htmlFor="reminder-interval">Reminder interval</label>
              <select
                id="reminder-interval"
                className="select"
                value={preferences.periodicIntervalMinutes}
                disabled={saving}
                onChange={(event) =>
                  void save({
                    ...preferences,
                    periodicIntervalMinutes: Number(event.target.value) as 30 | 60 | 90,
                  })
                }
              >
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 60 minutes</option>
                <option value="90">Every 90 minutes</option>
              </select>
            </div>
          ) : null}
        </fieldset>
        <p
          className={saveError ? 'error-box' : 'settings-save-status muted small'}
          role={saveError ? 'alert' : 'status'}
        >
          {saving ? 'Saving…' : message}
        </p>
      </section>
      <NotificationInbox initialEvents={initialEvents} />
    </>
  );
}
