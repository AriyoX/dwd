import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import {
  accountAccess,
  authRedirect,
  authRoutes,
  introductionSeen,
  legacyAuthRoute,
  rememberIntroduction,
} from '../apps/mobile/src/lib/auth-routing';
import { AuthHandoff, captureNativeDestination } from '../apps/mobile/src/lib/auth-state';

function memoryStore() {
  const records = new Map<string, string>();
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem: (key: string) => {
      records.delete(key);
    },
  };
}
const token = 'a'.repeat(43);
const invitation = `/join?token=${token}`;
const night = '/night/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('first launch introduction', () => {
  it('opens an introduction before the welcome, login and signup screens on a fresh installation', () => {
    const storage = memoryStore();
    expect(introductionSeen(storage)).toBe(false);
    for (const pathname of ['/welcome', '/auth', authRoutes.login, authRoutes.signup])
      expect(authRedirect('signed-out', pathname, introductionSeen(storage))).toBe('/onboarding');
  });
  it('persists completion or skip across cold starts and keeps it on sign-out', () => {
    const storage = memoryStore();
    const handoff = new AuthHandoff(storage);
    rememberIntroduction(storage);
    handoff.remember(invitation);
    handoff.clear();
    expect(introductionSeen(storage)).toBe(true);
    expect(authRedirect('signed-out', '/welcome', introductionSeen(storage))).toBeNull();
    expect(authRedirect('signed-out', authRoutes.signup, introductionSeen(storage))).toBeNull();
  });
  it('treats unknown values as unseen and allows a launch when storage is unavailable', () => {
    const storage = memoryStore();
    storage.setItem('dwd.mobile.introduction.v1', 'other');
    expect(introductionSeen(storage)).toBe(false);
    const unavailable = {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
    };
    expect(introductionSeen(unavailable)).toBe(false);
    expect(() => rememberIntroduction(unavailable)).not.toThrow();
  });
  it('allows confirmation, recovery and legal links to bypass the introductory steps', () => {
    for (const pathname of [
      authRoutes.confirm,
      authRoutes.recover,
      authRoutes.reset,
      '/auth/callback',
      '/legal',
    ])
      expect(authRedirect('signed-out', pathname, false)).toBeNull();
  });
});

describe('native product access', () => {
  it('wires every product route behind the completed-account Stack guard', () => {
    const source = ts.createSourceFile(
      'layout.tsx',
      readFileSync(new URL('../apps/mobile/app/_layout.tsx', import.meta.url), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const protectedScreens = new Set<string>();
    function visit(node: ts.Node, guarded = false) {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(source) === 'Stack.Protected'
      ) {
        guarded = node.openingElement.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(source) === 'guard' &&
            attribute.initializer?.getText(source) === "{access === 'ready'}",
        );
      }
      if (
        guarded &&
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(source) === 'Stack.Screen'
      ) {
        const name = node.attributes.properties.find(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'name',
        );
        if (
          name &&
          ts.isJsxAttribute(name) &&
          name.initializer &&
          ts.isStringLiteral(name.initializer)
        )
          protectedScreens.add(name.initializer.text);
      }
      ts.forEachChild(node, (child) => visit(child, guarded));
    }
    visit(source);
    const routes = readdirSync(new URL('../apps/mobile/app/', import.meta.url), {
      recursive: true,
    });
    for (const file of routes) {
      const route = String(file)
        .replaceAll('\\', '/')
        .replace(/\.tsx?$/, '');
      if (!/\.tsx?$/.test(String(file)) || /(^|\/)_[^/]+$/.test(route) || route.startsWith('+'))
        continue;
      if (
        route.startsWith('auth/') ||
        ['welcome', 'onboarding', 'legal', 'delete-account'].includes(route)
      )
        continue;
      expect(protectedScreens.has(route.startsWith('(tabs)/') ? '(tabs)' : route), route).toBe(
        true,
      );
    }
  });
  it('keeps every signed-out and session-restoring state out of the product navigator', () => {
    for (const profile of ['loading', 'complete', 'incomplete', 'error'] as const) {
      expect(accountAccess({ restoring: false, signedIn: false, profile, recovering: false })).toBe(
        'signed-out',
      );
      expect(accountAccess({ restoring: true, signedIn: true, profile, recovering: false })).toBe(
        'restoring',
      );
    }
  });
  it('allows account deletion before profile completion without exposing product routes', () => {
    expect(authRedirect('profile', '/delete-account', true)).toBeNull();
    expect(authRedirect('ready', '/delete-account', true)).toBeNull();
    expect(authRedirect('recovery', '/delete-account', true)).toBe(authRoutes.reset);
    const layout = readFileSync(new URL('../apps/mobile/app/_layout.tsx', import.meta.url), 'utf8');
    expect(layout).toMatch(
      /guard=\{access === 'ready' \|\| access === 'profile'\}[\s\S]*?name="delete-account"[\s\S]*?<\/Stack.Protected>/,
    );
  });
  it('requires a completed profile belonging to the current actor', () => {
    expect(
      accountAccess({ restoring: false, signedIn: true, profile: 'complete', recovering: false }),
    ).toBe('ready');
    expect(
      accountAccess({ restoring: false, signedIn: true, profile: 'loading', recovering: false }),
    ).toBe('restoring');
    for (const profile of ['error', 'incomplete'] as const)
      expect(accountAccess({ restoring: false, signedIn: true, profile, recovering: false })).toBe(
        'profile',
      );
  });
  it('isolates recovery sessions even when a completed profile exists', () => {
    expect(
      accountAccess({ restoring: false, signedIn: true, profile: 'complete', recovering: true }),
    ).toBe('recovery');
    for (const pathname of [
      '/welcome',
      '/',
      '/account',
      '/history',
      '/join',
      night,
      authRoutes.login,
    ])
      expect(authRedirect('recovery', pathname, true)).toBe(authRoutes.reset);
    expect(authRedirect('recovery', authRoutes.reset, true)).toBeNull();
  });
  it('routes missing or failed profiles to a screen with completion and sign-out recovery', () => {
    for (const pathname of ['/welcome', '/', '/account', night, authRoutes.login])
      expect(authRedirect('profile', pathname, true)).toBe(authRoutes.complete);
    expect(authRedirect('profile', authRoutes.complete, true)).toBeNull();
    expect(authRedirect('signed-out', authRoutes.complete, true)).toBe(authRoutes.login);
  });
  it('waits during restoration and sends completed accounts from auth screens to their destination', () => {
    expect(authRedirect('restoring', '/welcome', false)).toBeNull();
    for (const pathname of ['/welcome', '/onboarding', ...Object.values(authRoutes)])
      expect(authRedirect('ready', pathname, true)).toBe('destination');
    expect(authRedirect('ready', night, true)).toBeNull();
    for (const state of ['ready', 'profile', 'recovery', 'restoring'] as const)
      for (const pathname of ['/auth/callback', '/legal'])
        expect(authRedirect(state, pathname, false)).toBeNull();
  });
  it('keeps legacy mode links pointed at distinct screens', () => {
    for (const [mode, path] of Object.entries(authRoutes)) expect(legacyAuthRoute(mode)).toBe(path);
    for (const mode of ['unknown', '__proto__', 'constructor', undefined])
      expect(legacyAuthRoute(mode)).toBe(authRoutes.login);
  });
});

describe('protected deep link handoff', () => {
  it('captures an invitation before a protected route is discarded, survives introduction and cold restart, then resumes once', () => {
    const storage = memoryStore();
    expect(captureNativeDestination(`dwd://join/${token}`, new AuthHandoff(storage))).toBe(
      invitation,
    );
    rememberIntroduction(storage);
    new AuthHandoff(storage).confirmation('person@example.com');
    expect(authRedirect('ready', '/welcome', introductionSeen(storage))).toBe('destination');
    expect(new AuthHandoff(storage).consume()).toBe(invitation);
    expect(new AuthHandoff(storage).consume()).toBe('/');
  });
  it('captures protected tabs, join, nights, plans, logs, recaps and Expo development links', () => {
    const storage = memoryStore();
    const handoff = new AuthHandoff(storage);
    for (const destination of [
      '/account',
      '/history',
      '/join',
      '/night/new',
      night,
      `${night}/plan`,
      `${night}/log`,
      `${night}/summary`,
    ]) {
      expect(captureNativeDestination(`dwd://${destination}`, handoff)).toBe(destination);
      expect(handoff.read().next).toBe(destination);
      expect(captureNativeDestination(`exp://127.0.0.1:8082/--${destination}`, handoff)).toBe(
        destination,
      );
      expect(handoff.read().next).toBe(destination);
    }
  });
  it('retains the invitation through root launches, malformed links, legal pages and cancelled OAuth', () => {
    const handoff = new AuthHandoff(memoryStore());
    handoff.remember(invitation);
    for (const path of [
      'dwd:///',
      'dwd://unknown',
      'dwd:///auth/sign-in',
      'dwd:///legal?document=terms',
      'ftp://bad/join/short',
    ])
      captureNativeDestination(path, handoff);
    expect(handoff.read().next).toBe(invitation);
  });
  it('captures a safe callback destination without persisting the code or token hash', () => {
    const storage = memoryStore();
    const link = `dwd:///auth/callback?code=private-code&token_hash=private-hash&flow=recovery&next=${encodeURIComponent(invitation)}`;
    expect(captureNativeDestination(link, new AuthHandoff(storage))).toContain('/auth/callback?');
    expect(new AuthHandoff(storage).read().next).toBe(invitation);
    const saved = [...storage.records.values()].join('');
    expect(saved).not.toContain('private-code');
    expect(saved).not.toContain('private-hash');
  });
  it('rejects hostile callback destinations and web-based auth callbacks', () => {
    const handoff = new AuthHandoff(memoryStore());
    handoff.remember(invitation);
    captureNativeDestination(
      'dwd:///auth/callback?code=x&next=https%3A%2F%2Fevil.example',
      handoff,
    );
    expect(handoff.read().next).toBe(invitation);
    expect(captureNativeDestination('https://evil.example/auth/callback?code=x', handoff)).toBe(
      '/',
    );
    expect(
      captureNativeDestination('dwd:///night/------------------------------------', handoff),
    ).toBe('/');
  });
});
