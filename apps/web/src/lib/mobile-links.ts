const PACKAGE = 'com.dwd.app';
export function appleAppAssociation(team: string | undefined) {
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) return null;
  return { applinks: { apps: [], details: [{ appID: `${team}.${PACKAGE}`, paths: ['/join/*'] }] } };
}
export function androidAppAssociation(fingerprints: string | undefined) {
  const values = fingerprints
    ?.split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!values?.length || values.some((value) => !/^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/.test(value)))
    return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: values },
    },
  ];
}
