import Link from 'next/link';

export function Wordmark({ linked = true }: { linked?: boolean }) {
  const mark = <span className="wordmark" role="img" aria-label="dwd ? Drink with Desire" />;
  return linked ? <Link href="/">{mark}</Link> : mark;
}
