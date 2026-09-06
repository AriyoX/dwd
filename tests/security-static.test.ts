import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationPath = join(root, 'supabase', 'migrations', '20260906121948_initial_dwd_schema.sql');
const migration = readFileSync(migrationPath, 'utf8').toLowerCase();

describe('database security invariants', () => {
  const exposedTables = [
    'profiles',
    'nights',
    'night_end_time_changes',
    'night_members',
    'drink_plan_items',
    'drink_logs',
    'water_logs',
    'night_invites',
    'night_alerts',
    'audit_events',
  ];

  it.each(exposedTables)('enables RLS on %s', (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it('does not use deprecated role-only authorization', () => {
    expect(migration).not.toContain('auth.role()');
    expect(migration).not.toMatch(/create policy[\s\S]*using\s*\(\s*true\s*\)/);
  });

  it('gives every direct update policy both predicates', () => {
    const policies = [...migration.matchAll(/create policy[\s\S]*?for update[\s\S]*?;/g)];
    expect(policies).not.toHaveLength(0);
    for (const policy of policies) {
      expect(policy[0]).toContain('using');
      expect(policy[0]).toContain('with check');
    }
  });

  it('keeps raw invites and audit events out of browser table privileges', () => {
    expect(migration).toContain('revoke all on public.night_invites from anon, authenticated');
    expect(migration).toContain('revoke all on public.audit_events from anon, authenticated');
    expect(migration).not.toMatch(
      /grant\s+(insert|delete|truncate)\s+on table[\s\S]*?to authenticated/,
    );
  });

  it('hardens every security-definer function with an empty search path', () => {
    const declarations = migration.split('create or replace function ').slice(1);
    const definerDeclarations = declarations.filter((item) =>
      item.slice(0, item.indexOf('as $$')).includes('security definer'),
    );
    expect(definerDeclarations.length).toBeGreaterThan(10);
    for (const declaration of definerDeclarations) {
      expect(declaration.slice(0, declaration.indexOf('as $$'))).toContain("set search_path = ''");
    }
  });

  it('indexes required membership, ownership, and timeline predicates', () => {
    for (const marker of [
      'nights_host_user_id_idx',
      'night_end_time_changes_night_id_idx',
      'night_members_night_id_idx',
      'night_members_user_id_idx',
      'night_members_managed_by_idx',
      'drink_plan_items_member_active_idx',
      'drink_logs_night_id_idx',
      'drink_logs_member_consumed_idx',
      'drink_logs_actor_user_id_idx',
      'water_logs_night_id_idx',
      'water_logs_member_consumed_idx',
      'night_alerts_night_id_idx',
      'night_alerts_member_id_idx',
    ])
      expect(migration).toContain(marker);
  });

  it('uses constrained RPCs for critical lifecycle mutations', () => {
    for (const operation of [
      'start_night_out',
      'redeem_night_invite',
      'log_drink',
      'log_water',
      'soft_delete_activity',
      'extend_night',
      'end_night',
    ])
      expect(migration).toContain(`function public.${operation}`);
    expect(migration).toContain('unique (actor_user_id, idempotency_key)');
    expect(migration).toContain("v_now > v_night.ended_at + interval '24 hours'");
  });
});

describe('workspace and secret boundaries', () => {
  it('keeps core free of framework, Supabase, Node, and browser imports', () => {
    const coreFiles = sourceFiles(join(root, 'packages', 'core', 'src'));
    const contents = coreFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(contents).not.toMatch(/from ['"](?:react|next|@supabase|node:)/);
    expect(contents).not.toMatch(/\b(?:window|document|localStorage)\s*\.|\bcookies\s*\(/);
  });

  it('prevents shared packages from importing the web application', () => {
    const sharedFiles = sourceFiles(join(root, 'packages'));
    for (const file of sharedFiles) {
      expect(readFileSync(file, 'utf8'), relative(root, file)).not.toMatch(
        /apps\/web|@\/|from ['"]next/,
      );
    }
  });

  it('contains no mobile workspace or native dependency', () => {
    expect(existsSync(join(root, 'apps', 'mobile'))).toBe(false);
    expect(existsSync(join(root, 'android'))).toBe(false);
    expect(existsSync(join(root, 'ios'))).toBe(false);
    const packageFiles = [join(root, 'package.json'), ...findNamed(root, 'package.json')];
    const packages = packageFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(packages).not.toMatch(
      /"(?:react-native|expo|expo-router|nativewind|@react-native-async-storage\/async-storage|expo-secure-store)"\s*:/i,
    );
  });

  it('does not commit recognizable live keys or public secret variables', () => {
    const files = sourceFiles(root).filter(
      (file) => !file.includes(join(root, 'node_modules')) && !file.includes(join(root, '.next')),
    );
    const contents = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(contents).not.toMatch(/next_public_[a-z0-9_]*(?:secret|service_role)/i);
    expect(contents).not.toMatch(/sb_secret_[a-z0-9_-]{20,}/i);
    expect(contents).not.toMatch(/eyj[a-z0-9_-]{20,}\.[a-z0-9_-]{20,}\.[a-z0-9_-]{20,}/i);
  });
});

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === 'dist' ||
      entry === '.git' ||
      entry === '.tmp'
    )
      continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|mjs|json|sql|md|example)$/.test(entry)) result.push(path);
  }
  return result;
}

function findNamed(directory: string, name: string): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === 'dist' ||
      entry === '.git' ||
      entry === '.tmp'
    )
      continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...findNamed(path, name));
    else if (entry === name && path !== join(root, name)) result.push(path);
  }
  return result;
}
