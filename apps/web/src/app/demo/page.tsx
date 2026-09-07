import { DemoNight } from '@/features/demo/demo-night';
import { safeReturnPath } from '@/lib/navigation';
export const metadata = { title: 'Try a demo' };
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <DemoNight next={safeReturnPath(next)} />;
}
