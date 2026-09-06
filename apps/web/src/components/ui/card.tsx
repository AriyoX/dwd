import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
