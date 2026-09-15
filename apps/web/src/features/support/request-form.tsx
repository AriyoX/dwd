'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { submitSupportRequest } from './actions';

export function RequestForm({ deletion = false }: { deletion?: boolean }) {
  const [kind, setKind] = useState<'feedback' | 'problem'>('problem');
  const [message, setMessage] = useState(
    deletion ? 'Please review my account and personal data for deletion.' : '',
  );
  const [confirmed, setConfirmed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const inFlight = useRef(false);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<{
    requestKey: string;
    kind: 'feedback' | 'problem' | 'deletion';
    message: string;
    confirmed: boolean;
  } | null>(null);
  if (receipt)
    return (
      <div className="success-box stack" role="status">
        <strong>{deletion ? 'Deletion request received' : 'Report received'}</strong>
        <p className="small">
          Reference: {receipt}. You can check its status and any response in your account.
        </p>
        {deletion && (
          <p className="small">
            Your account and shared records remain available while the request is reviewed. Nothing
            has been deleted yet.
          </p>
        )}
        <Link className="text-link" href="/account">
          View your requests
        </Link>
      </div>
    );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current) return;
        const currentMessage = messageInput.current?.value ?? message;
        if (!attempt.current && currentMessage.trim().length < 10) {
          setError('Write at least 10 characters, excluding surrounding spaces.');
          return;
        }
        inFlight.current = true;
        setPending(true);
        setError(null);
        try {
          const payload = attempt.current ?? {
            requestKey: crypto.randomUUID(),
            kind: deletion ? 'deletion' : kind,
            message: currentMessage,
            confirmed,
          };
          attempt.current = payload;
          setLocked(true);
          const result = await submitSupportRequest(payload);
          if (result.ok) {
            setReceipt(result.id);
          } else setError(result.error);
        } catch {
          setError('Couldn’t connect. Retry this request.');
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset className="wizard-fields stack" disabled={pending || locked}>
        {!deletion && (
          <label className="field">
            Type
            <select
              className="select"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'feedback' | 'problem')}
            >
              <option value="problem">Report a problem</option>
              <option value="feedback">Share feedback</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>{deletion ? 'Request details' : 'What happened?'}</span>
          <textarea
            id="support-message"
            className="input"
            ref={messageInput}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minLength={10}
            maxLength={4000}
            required
          />
        </label>
        <p className="muted small">
          Include only what is needed. Do not include passwords, invitation links, or another
          person’s private details. No screenshots or diagnostics are attached automatically.
        </p>
        {deletion && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>
              I understand this is a request for review. My account and shared-night records are not
              deleted immediately.
            </span>
          </label>
        )}
      </fieldset>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} variant={deletion ? 'danger' : 'primary'}>
        {pending
          ? 'Submitting…'
          : error
            ? 'Retry request'
            : deletion
              ? 'Request account deletion'
              : 'Send report'}
      </Button>
    </form>
  );
}
