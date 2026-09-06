import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Wordmark } from '@/components/layout/wordmark';

export default function NotFound() {
  return (
    <main className="page-shell error-page" id="main-content">
      <div className="stack-lg">
        <Wordmark />
        <Card className="stack">
          <h1>Not found.</h1>
          <p className="muted">This night is unavailable or you are not a current member.</p>
          <Link className="button button-primary" href="/home">
            Go home
          </Link>
        </Card>
      </div>
    </main>
  );
}
