import type { NightRealtimeEvent } from '@dwd/core';

export interface NightRealtimeSubscription {
  unsubscribe(): Promise<void> | void;
}

export interface NightRealtimeService {
  subscribe(
    nightId: string,
    memberIds: readonly string[],
    onEvent: (event: NightRealtimeEvent) => void,
    onStatus: (status: 'connected' | 'reconnecting' | 'offline') => void,
  ): NightRealtimeSubscription;
}
