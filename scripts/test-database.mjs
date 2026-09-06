import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const containerName = `dwd-db-test-${process.pid}`;
const image = process.env.DWD_TEST_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143';
const root = process.cwd();
const migration = join(root, 'supabase', 'migrations', '20260906121948_initial_dwd_schema.sql');
const tests = join(root, 'supabase', 'tests', 'database_lifecycle.sql');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ inherit?: boolean; allowFailure?: boolean }} [options]
 */
function execute(command, args, { inherit = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  });
  if (!allowFailure && (result.error !== undefined || result.status !== 0)) {
    if (!inherit) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw result.error ?? new Error(`${command} exited with status ${String(result.status)}.`);
  }
  return result;
}

/** @param {...string} args */
function docker(...args) {
  return execute('docker', args);
}

try {
  execute('docker', ['info']);
  console.log(`Starting isolated Supabase Postgres test container (${image})…`);
  docker('run', '-d', '--name', containerName, '-e', 'POSTGRES_PASSWORD=postgres', image);

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = execute(
      'docker',
      ['exec', containerName, 'pg_isready', '-U', 'supabase_admin', '-d', 'postgres'],
      { allowFailure: true },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!ready) {
    execute('docker', ['logs', '--tail', '200', containerName], {
      inherit: true,
      allowFailure: true,
    });
    throw new Error('Supabase Postgres did not become ready within 60 seconds.');
  }

  docker('cp', migration, `${containerName}:/tmp/dwd.sql`);
  docker('cp', tests, `${containerName}:/tmp/database_lifecycle.sql`);
  execute('docker', [
    'exec',
    containerName,
    'psql',
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-f',
    '/tmp/dwd.sql',
  ]);
  const testRun = execute('docker', [
    'exec',
    containerName,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-f',
    '/tmp/database_lifecycle.sql',
  ]);
  const output = testRun.stdout;
  process.stdout.write(output);
  const passed = output.match(/^ok \d+ - /gm)?.length ?? 0;
  if (output.includes('not ok') || output.includes('Looks like') || passed !== 42) {
    throw new Error(`Database test plan did not pass cleanly (${passed}/42 passing assertions).`);
  }
  console.log('Database integration tests passed (42/42).');
} finally {
  execute('docker', ['rm', '-f', containerName], { allowFailure: true });
}
