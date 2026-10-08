import { createContext } from 'react';

export const PermissionContext = createContext<{
  ready: boolean;
  notificationsOff: boolean;
  locationOff: boolean;
  busy: boolean;
  dismissed: boolean;
  issue: string | null;
  enable: () => Promise<void>;
  dismiss: () => void;
} | null>(null);
