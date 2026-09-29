import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Separate from both the development backend and the developer's dwd-e2e stack.
const workdir = '.tmp/browser-ci';
const projectId = 'dwd-browser-ci';

if (process.argv.includes('--write-env')) {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for CI credential export.');
  const status = parseEnv(
    execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
  const values = {
    E2E_SUPABASE_URL: status.API_URL,
    E2E_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    E2E_SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    E2E_AUTH_DB_CONTAINER: `supabase_db_${projectId}`,
  };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value || /[\r\n]/.test(value))
      throw new Error(`Missing or invalid local test setting: ${key}`);
  }
  if (new URL(values.E2E_SUPABASE_URL).origin !== 'http://127.0.0.1:55321')
    throw new Error('Refusing to export credentials for a non-test backend.');
  console.log(`::add-mask::${values.E2E_SUPABASE_PUBLISHABLE_KEY}`);
  console.log(`::add-mask::${values.E2E_SUPABASE_SECRET_KEY}`);
  appendFileSync(
    process.env.GITHUB_ENV,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
} else {
  mkdirSync(`${workdir}/supabase`, { recursive: true });
  let config = readFileSync('supabase/config.toml', 'utf8')
    .replace(/^project_id = "dwd"/m, `project_id = "${projectId}"`)
    .replace(/\b543(\d{2})\b/g, '553$1')
    .replaceAll('localhost:3000', 'localhost:3100')
    .replaceAll('127.0.0.1:3000', '127.0.0.1:3100');
  // The suite creates many disposable accounts from the same runner IP.
  config = config.replace(
    /^(email_sent|token_refresh|sign_in_sign_ups|token_verifications) = \d+/gm,
    '$1 = 1000',
  );
  // Fail if the source config changes format instead of starting the wrong project.
  if (!config.includes(`project_id = "${projectId}"`))
    throw new Error('Test project ID was not set.');
  writeFileSync(`${workdir}/supabase/config.toml`, config);
  for (const path of ['migrations', 'templates', 'seed.sql']) {
    cpSync(`supabase/${path}`, `${workdir}/supabase/${path}`, { recursive: true });
  }
  console.log('Prepared isolated browser test backend.');
}
