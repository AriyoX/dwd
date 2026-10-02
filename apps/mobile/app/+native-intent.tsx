import 'expo-sqlite/localStorage/install';
import {
  authHandoff,
  captureNativeDestination,
  nativeLinkDestination,
} from '../src/lib/auth-state';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return captureNativeDestination(path, authHandoff());
  } catch {
    return nativeLinkDestination(path);
  }
}
