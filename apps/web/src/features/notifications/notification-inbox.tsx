'use client';

import Link from 'next/link';
import { Bell, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { NotificationEvent } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { BrowserNotificationService } from '@/adapters/notifications.browser';
import { acknowledgeNotificationAction } from './actions';

export function NotificationInbox({
  initialEvents = [],
  nightId,
}: {
  initialEvents?: NotificationEvent[];
  nightId?: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [timeZone, setTimeZone] = useState('UTC');
  const [marking, setMarking] = useState<string[]>([]);
  const markingRef = useRef(new Set<string>());
  const read = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current || !navigator.onLine || document.visibilityState === 'hidden') return;
    inFlight.current = true;
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/notifications', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      const result = (await response.json()) as
        { ok: true; data: NotificationEvent[] } | { ok: false; error: string };
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEvents(
        result.data.map((event) => ({
          ...event,
          acknowledgedAt: read.current.get(event.id) ?? event.acknowledgedAt,
        })),
      );
      setNow(Date.now());
      setError(null);
      // Configured push owns OS delivery. Without it, enhance the in-app inbox
      // opportunistically while this page is open; no permission prompt here.
      if (!process.env['NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY']) {
        const service = new BrowserNotificationService();
        for (const event of result.data.filter(
          (item) => item.acknowledgedAt === null && !read.current.has(item.id),
        )) {
          if (Date.now() - Date.parse(event.createdAt) > 120_000) continue;
          const key = `dwd-notified:${event.recipientUserId}:${event.id}`;
          const showOnce = async () => {
            try {
              if (localStorage.getItem(key) !== null) return;
              if (
                await service.show({
                  title: 'DWD notification',
                  body: 'You have a DWD update.',
                  tag: event.id,
                })
              )
                localStorage.setItem(key, '1');
            } catch {
              /* In-app delivery remains available when storage is blocked. */
            }
          };
          if ('locks' in navigator) await navigator.locks.request(key, showOnce);
          else await showOnce();
        }
      }
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setError('Notifications could not refresh. Retry when connected.');
    } finally {
      inFlight.current = false;
      if (request.current === controller) request.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
    queueMicrotask(() => void refresh());
    const poll = () => void refresh();
    const timer = window.setInterval(poll, 10_000);
    window.addEventListener('focus', poll);
    window.addEventListener('online', poll);
    document.addEventListener('visibilitychange', poll);
    return () => {
      mounted.current = false;
      request.current?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', poll);
      window.removeEventListener('online', poll);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  async function acknowledge(id: string) {
    if (markingRef.current.has(id)) return;
    markingRef.current.add(id);
    setMarking([...markingRef.current]);
    try {
      const result = await acknowledgeNotificationAction({ notificationId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const acknowledgedAt = new Date().toISOString();
      read.current.set(id, acknowledgedAt);
      setError(null);
      setEvents((current) =>
        current.map((event) => (event.id === id ? { ...event, acknowledgedAt } : event)),
      );
    } catch {
      setError('Could not mark this notification read. Retry.');
    } finally {
      markingRef.current.delete(id);
      setMarking([...markingRef.current]);
    }
  }

  const visible = events.filter(
    (event) =>
      (event.expiresAt === null || Date.parse(event.expiresAt) > now) &&
      (nightId === undefined || (event.nightId === nightId && event.acknowledgedAt === null)),
  );
  const displayed = nightId !== undefined && !expanded ? visible.slice(0, 3) : visible;
  const unreadCount = visible.filter((event) => event.acknowledgedAt === null).length;
  if (nightId !== undefined && visible.length === 0 && error === null) return null;
  return (
    <section className="stack notification-inbox" aria-label="Notifications">
      {nightId === undefined ? (
        <div className="row-between">
          <h2>Recent notifications</h2>
          <span className="pill" role="status">
            {unreadCount} unread
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="notification-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Hide notifications' : 'Show notifications'}
          onClick={() => setOpen(!open)}
        >
          <Bell size={18} aria-hidden="true" />
          <span>Notifications</span>
          <span className="pill" role="status">
            {unreadCount} unread
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      )}
      {nightId !== undefined && !open && visible[0] ? (
        <p className="notification-preview muted small">{visible[0].title}</p>
      ) : null}
      {error ? (
        <p className="error-box" role="status">
          {error}{' '}
          <button className="text-link" type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      ) : null}
      <div id={panelId} className="stack" hidden={nightId !== undefined && !open}>
        {(nightId === undefined || open) &&
          (visible.length === 0 ? (
            <p className="muted small">No notifications yet.</p>
          ) : (
            displayed.map((event) => (
              <article
                className="notification-item"
                data-read={event.acknowledgedAt !== null}
                key={event.id}
              >
                <strong>{event.title}</strong>
                {event.body.replace(/[.!?]+$/, '') !== event.title.replace(/[.!?]+$/, '') ? (
                  <p>{event.body}</p>
                ) : null}
                <time className="muted small" dateTime={event.createdAt} title={timeZone}>
                  {new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone,
                  }).format(new Date(event.createdAt))}
                </time>
                <div className="notification-actions">
                  {nightId === undefined ? (
                    <Link className="text-link" href={event.deepLink}>
                      Open night
                    </Link>
                  ) : null}
                  {event.acknowledgedAt === null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={marking.includes(event.id)}
                      onClick={() => void acknowledge(event.id)}
                    >
                      {marking.includes(event.id) ? 'Saving…' : 'Mark read'}
                    </Button>
                  ) : (
                    <span className="muted small">Read</span>
                  )}
                </div>
              </article>
            ))
          ))}
        {nightId !== undefined && visible.length > 3 ? (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show fewer' : `Show all ${visible.length} notifications`}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
