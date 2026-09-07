import Link from 'next/link';

export function Wordmark({ linked = true }: { linked?: boolean }) {
  const mark = (
    <span className="wordmark" aria-label="DWD — Drink with Desire">
      <span aria-hidden="true" className="wordmark-icon">
        <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
          <path
            d="m8 12 5 24h9l2-12 2 12h9l5-24"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m10 22 10 2m8 0 10-2M21 8l3 5 3-5"
            stroke="#d9a65b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m14 28 2 4m18-4-2 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="wordmark-name">
        dwd<span className="wordmark-period">.</span>
      </span>
    </span>
  );
  return linked ? <Link href="/">{mark}</Link> : mark;
}
