import { type ReactNode } from 'react';
import { QuickLogShell } from '@/features/quick-log/shell';
export default function QuickLayout({ children }: { children: ReactNode }) {
  return <QuickLogShell>{children}</QuickLogShell>;
}
