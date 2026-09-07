import { redirect } from 'next/navigation';
import { safeReturnPath } from '@/lib/navigation';

// Keep old bookmarks usable without exposing the retired demo.
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(`/login?next=${encodeURIComponent(safeReturnPath(next))}`);
}
