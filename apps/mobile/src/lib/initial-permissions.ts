type Grant = { granted: boolean; canAskAgain: boolean; status: string };
export const initialPermissionKey = (kind: 'notifications' | 'location') =>
  `dwd.mobile.permission.v1:${kind}`;

/** Only the OS can grant permission. Record each first-launch attempt separately. */
export async function requestInitialPermission<T extends Grant>(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  kind: 'notifications' | 'location',
  read: () => Promise<T>,
  request: () => Promise<T>,
): Promise<T> {
  const grant = await read();
  if (
    storage.getItem(initialPermissionKey(kind)) ||
    grant.granted ||
    !grant.canAskAgain ||
    grant.status !== 'undetermined'
  )
    return grant;
  const result = await request();
  storage.setItem(initialPermissionKey(kind), 'asked');
  return result;
}
