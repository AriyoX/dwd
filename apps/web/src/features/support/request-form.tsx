'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Check, Lightbulb, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitSupportRequest } from './actions';

export function RequestForm({ deletion = false }: { deletion?: boolean }) {
  const [kind, setKind] = useState<'feedback' | 'problem'>('problem');
  const [message, setMessage] = useState(
    deletion ? 'Please delete my account and personal details.' : '',
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
      <div className="success-box stack support-success" role="status">
        <Check size={28} aria-hidden="true" />
        <strong>{deletion ? 'We’ve received your request' : 'Thanks for letting us know'}</strong>
        <p className="small">Check Your messages for updates and replies.</p>
        {deletion && (
          <p className="small">
            You can still use your account while we review your request. Nothing has been deleted
            yet.
          </p>
        )}
        <Link className="text-link" href="/account#messages">
          View your messages
        </Link>
        <details className="small muted">
          <summary>Message reference</summary>
          <p>{receipt}</p>
        </details>
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
          setError('Tell us a little more — at least 10 characters.');
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
          <fieldset className="support-topics">
            <legend>How can we help?</legend>
            <label className="support-topic">
              <input
                type="radio"
                name="kind"
                value="problem"
                checked={kind === 'problem'}
                onChange={() => setKind('problem')}
              />
              <MessageCircle size={22} aria-hidden="true" />
              <span>Something isn’t working</span>
            </label>
            <label className="support-topic">
              <input
                type="radio"
                name="kind"
                value="feedback"
                checked={kind === 'feedback'}
                onChange={() => setKind('feedback')}
              />
              <Lightbulb size={22} aria-hidden="true" />
              <span>I have an idea</span>
            </label>
          </fieldset>
        )}
        <label className="field">
          <span>
            {deletion
              ? 'Your message'
              : kind === 'feedback'
                ? 'What would you love to see?'
                : 'What happened?'}
          </span>
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
          Keep passwords, invite links and other people’s private details out of your message.
        </p>
        {deletion && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>I understand my account and shared nights won’t be deleted straight away.</span>
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
          ? 'Sending…'
          : error
            ? 'Try again'
            : deletion
              ? 'Request account deletion'
              : 'Send message'}
        {!deletion && <Send size={17} aria-hidden="true" />}
      </Button>
    </form>
  );
}
