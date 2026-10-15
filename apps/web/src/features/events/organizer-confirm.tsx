'use client';
import { useEffect, useRef, useState } from 'react';
import { photoErrorMessage, photoRequest } from './photo-client';

export function OrganizerConfirmation() {
  const started = useRef(false);
  const [message, setMessage] = useState('Confirming your organizer sign-in…');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const input = query.has('code')
      ? {
          code: query.get('code'),
          ...(query.get('sb_flow_id') ? { flowId: query.get('sb_flow_id') } : {}),
        }
      : query.has('token_hash')
        ? { token_hash: query.get('token_hash') }
        : {
            access_token: fragment.get('access_token'),
            refresh_token: fragment.get('refresh_token'),
          };
    window.history.replaceState(null, '', window.location.pathname);
    void photoRequest('organizer-confirm', { method: 'POST', body: input })
      .then(() => window.location.replace('/events/the-link-up/admin'))
      .catch((cause: unknown) => setMessage(photoErrorMessage(cause)));
  }, []);
  return (
    <>
      <p role="status">{message}</p>
      <a href="/events/the-link-up/admin">Return to organizer sign-in</a>
    </>
  );
}
