import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  full = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant}${full ? ' button-full' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
