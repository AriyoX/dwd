import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const path = 'apps/web/.env.local';
let content = readFileSync(path, 'utf8');
for (const key of ['LINK_UP_SESSION_SECRET', 'CRON_SECRET']) {
  if (!new RegExp(`^${key}=.+`, 'm').test(content))
    content += `\n${key}=${randomBytes(32).toString('base64url')}\n`;
}
writeFileSync(path, content);
console.log('Dedicated session and cron secrets configured locally. Values were not printed.');
