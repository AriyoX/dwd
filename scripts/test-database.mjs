import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const containerName = `dwd-db-test-${process.pid}`;
const image = process.env.DWD_TEST_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143';
const root = process.cwd();
const migrations = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const suites = readdirSync(join(root, 'supabase', 'tests'))
  .filter((file) => file.endsWith('.sql'))
  .sort();

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
  docker(
    'run',
    '-d',
    '--name',
    containerName,
    ...(process.env.DWD_TEST_DB_PORT
      ? ['-p', `127.0.0.1:${process.env.DWD_TEST_DB_PORT}:5432`]
      : []),
    '-e',
    'POSTGRES_PASSWORD=postgres',
    image,
  );

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = execute(
      'docker',
      [
        'exec',
        containerName,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
      ],
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

  for (const migration of migrations) {
    docker(
      'cp',
      join(root, 'supabase', 'migrations', migration),
      `${containerName}:/tmp/migration.sql`,
    );
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
      '/tmp/migration.sql',
    ]);
  }
  for (const suite of suites) {
    const path = join(root, 'supabase', 'tests', suite);
    const expected = Number(readFileSync(path, 'utf8').match(/extensions\.plan\((\d+)\)/)?.[1]);
    if (!expected) throw new Error(`Missing pgTAP plan in ${suite}.`);
    docker('cp', path, `${containerName}:/tmp/tests.sql`);
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
      '/tmp/tests.sql',
    ]);
    const output = testRun.stdout;
    process.stdout.write(output);
    const passed = output.match(/^ok \d+ - /gm)?.length ?? 0;
    if (output.includes('not ok') || output.includes('Looks like') || passed !== expected)
      throw new Error(`${suite}: ${passed}/${expected} passing assertions.`);
    console.log(`${suite}: ${passed}/${expected} passed.`);
  }
} finally {
  if (process.env.DWD_TEST_KEEP_CONTAINER === 'true')
    console.log(`Kept isolated test container: ${containerName}`);
  else execute('docker', ['rm', '-f', containerName], { allowFailure: true });
}
