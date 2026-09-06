import Link from 'next/link';
import { GlassWater } from 'lucide-react';

export function Wordmark({ linked = true }: { linked?: boolean }) {
  const mark = (
    <span className="wordmark">
      <span aria-hidden="true" className="wordmark-icon">
        <GlassWater size={22} strokeWidth={1.8} />
      </span>
      <span className="wordmark-name">
        Drink with
        <br />
        Desire<span className="wordmark-period">.</span>
      </span>
    </span>
  );
  return linked ? <Link href="/home">{mark}</Link> : mark;
}
