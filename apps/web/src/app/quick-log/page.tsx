import type { Metadata } from 'next';
import { QuickLogger } from '@/features/quick-log/logger';
export const metadata: Metadata = { title: 'Quick Log' };
export default function QuickLogPage() {
  return <QuickLogger />;
}
