'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '../ui/button';

export function SubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return (
    <Button type="submit" full disabled={status.pending} aria-busy={status.pending}>
      {status.pending ? pending : idle}
    </Button>
  );
}
