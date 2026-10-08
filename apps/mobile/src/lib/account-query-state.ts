// Revisions contain no account data. Related pages share an invalidation key.
const revisions = new Map<string, number>();
const keyFor = (owner: string, scope: string) => `${owner}:${scope.split(':')[0]}`;

export function accountQueryRevision(owner: string, scope: string) {
  return revisions.get(keyFor(owner, scope)) ?? 0;
}

export function invalidateAccountQuery(owner: string, scope: string) {
  revisions.set(keyFor(owner, scope), accountQueryRevision(owner, scope) + 1);
}
