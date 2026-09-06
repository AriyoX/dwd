export type RealtimeEntity =
  'nights' | 'night_members' | 'drink_plan_items' | 'drink_logs' | 'water_logs' | 'night_alerts';

export interface NightRealtimeEvent {
  nightId: string;
  entity: RealtimeEntity;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  receivedAt: string;
}
