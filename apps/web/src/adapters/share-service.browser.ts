'use client';

import type { ShareService } from '@dwd/contracts';

export class BrowserShareService implements ShareService {
  public canShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  public async share(
    title: string,
    text: string,
    url: string,
  ): Promise<'shared' | 'cancelled' | 'unavailable'> {
    if (!this.canShare()) return 'unavailable';
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError'
        ? 'cancelled'
        : 'unavailable';
    }
  }

  public async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }
}
