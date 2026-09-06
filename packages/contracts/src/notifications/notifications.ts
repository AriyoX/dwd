export interface BrowserNotificationRequest {
  title: string;
  body: string;
  tag: string;
}

export interface NotificationService {
  permission(): 'default' | 'denied' | 'granted' | 'unsupported';
  requestPermission(): Promise<'default' | 'denied' | 'granted' | 'unsupported'>;
  show(input: BrowserNotificationRequest): Promise<boolean>;
  vibrate(pattern?: readonly number[]): boolean;
}

export interface ShareService {
  canShare(): boolean;
  share(title: string, text: string, url: string): Promise<'shared' | 'cancelled' | 'unavailable'>;
  copy(text: string): Promise<void>;
}

export interface VisibilityService {
  isVisible(): boolean;
  subscribe(onVisible: () => void): () => void;
}
