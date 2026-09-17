'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function TimedNotice({
  children,
  onDismiss,
  className = 'warning-box row',
  duration = 10_000,
}: {
  children: ReactNode;
  onDismiss: () => void;
  className?: string;
  duration?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (hovered || focused) return;
    const timer = window.setTimeout(() => dismiss.current(), duration);
    return () => window.clearTimeout(timer);
  }, [duration, hovered, focused]);
  return (
    <div
      className={className}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="notice-content">{children}</div>
      <button
        type="button"
        className="icon-text-button"
        aria-label="Dismiss notice"
        onClick={onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
