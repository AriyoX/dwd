'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { parseInviteInput } from './invite-input';
import { useTour } from '@/features/tour/tour-provider';

export function JoinCodeForm() {
  const tour = useTour();
  const [practiceValue, setPracticeValue] = useState('Practice invite');
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function join(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tour?.active) {
      tour.goTo('log');
      return;
    }
    const token = parseInviteInput(value);
    if (token === null) {
      setError('Enter a valid invitation link or code.');
      return;
    }
    setPending(true);
    router.push(`/join/${encodeURIComponent(token)}`);
  }

  return (
    <form className="stack" onSubmit={join}>
      <div className="field">
        <label htmlFor="join-code">Invitation link or code</label>
        <input
          className="input"
          id="join-code"
          placeholder="Paste your invitation"
          value={tour?.active ? practiceValue : value}
          onChange={(event) => {
            if (tour?.active) setPracticeValue(event.target.value);
            else setValue(event.target.value);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : 'join-error'}
        />
      </div>
      {error === null ? null : (
        <p id="join-error" className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" full disabled={pending}>
        {pending ? 'Opening…' : 'Join night'}
        <ArrowRight aria-hidden="true" size={18} />
      </Button>
    </form>
  );
}
