/**
 * aHouseLinkOpensItsPage.test.ts — a link to the house's website opens the app on its page
 * (decision 9, P4.20).
 *
 * housePaths.json is the one list. It names every route the website has, each claimed by the app
 * with the page it opens there, or kept on the website; every claimed page is a route file the
 * app has; Android's intent filters and iOS's associated domains (app.json) claim exactly what it
 * claims, and never the whole host; and each claimed address, read by redirectSystemPath, is the
 * app's own path for it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';
import { MOBILE } from '@/test-utils/readCode';
import { appPathOf } from '../houseLink';
import { redirectSystemPath } from '@/app/+native-intent';
import table from '../housePaths.json';

const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
const website = files('website').find((f) => rel(f).endsWith('src/App.tsx'));
const claimed = table.paths.filter((p) => p.app !== null);

/** A path with every named part made one: /film/:id and /film/[id] both read /film/:. */
const shapeOf = (path: string) => path.replace(/:\w+\??/g, ':').replace(/\/+$/, '') || '/';

/** Every path expo-router serves from app/: groups dropped, [x] a named part, index the folder. */
const appRoutes = files('routes').map(rel)
  .filter((r) => /^app\/.*\.tsx$/.test(r) && !/(^|\/)(_layout|\+[\w-]+)\.tsx$/.test(r))
  .map((r) => shapeOf(`/${r.replace(/^app\//, '').replace(/\.tsx$/, '')}`
    .replace(/\/\([^)]+\)/g, '').replace(/\[(\w+)\]/g, ':$1').replace(/\/index$/, '')));

describe('the one list of the house\'s addresses', () => {
  it('names every route the website has, and none it does not', () => {
    expect(website).toBeDefined();
    const routes = [...readFileSync(website!, 'utf8').matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
    expect(routes.length).toBeGreaterThan(25);
    expect(table.paths.map((p) => p.web).sort()).toEqual([...new Set(routes)].sort());
  });

  it('claims only pages the app has a route for', () => {
    expect(appRoutes).toContain('/film/:');
    expect(claimed.filter((p) => !appRoutes.includes(shapeOf(p.app!.split('?')[0]!))).map((p) => p.web)).toEqual([]);
  });

  it('keeps sign-in, the legal pages, help and the website\'s own panel on the website', () => {
    const kept = table.paths.filter((p) => p.app === null).map((p) => p.web);
    for (const web of ['/auth/callback', '/auth/reset-password', '/join', '/login', '/verify', '/forgot-password', '/privacy', '/terms', '/support', '/admin', '/', '*']) {
      expect(kept).toContain(web);
    }
    expect(table.paths.filter((p) => p.app === null && !(p as { why?: string }).why).map((p) => p.web)).toEqual([]);
  });
});

describe('the phones are told the same list', () => {
  const filters = appJson.android.intentFilters as { action: string; autoVerify: boolean; category: string[]; data: Record<string, string>[] }[];
  const https = filters.filter((f) => f.data.some((d) => d.scheme === 'https'));

  it('Android claims each claimed path, verified, and no other', () => {
    expect(https).toHaveLength(1);
    expect(https[0]).toMatchObject({ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'] });
    const want = claimed.map((p) => {
      const fixed = `/${p.web.split('/').filter((s) => s && !s.startsWith(':')).join('/')}`;
      return p.web.includes(':') ? { scheme: 'https', host: table.host, pathPrefix: `${fixed}/` } : { scheme: 'https', host: table.host, path: fixed };
    });
    expect(https[0]!.data).toEqual(want);
  });

  it('never claims the whole host, or a page the website keeps', () => {
    const data = https.flatMap((f) => f.data);
    expect(data.filter((d) => !d.path && !d.pathPrefix && !d.pathPattern)).toEqual([]);
    const kept = table.paths.filter((p) => p.app === null).map((p) => p.web);
    expect(data.filter((d) => d.path === '/' || kept.includes(d.path ?? '') || d.pathPrefix === '/')).toEqual([]);
    expect(data.filter((d) => d.host !== table.host)).toEqual([]);
  });

  it('iOS links the house\'s address and shares its saved passwords, and names nothing else', () => {
    expect(appJson.ios.associatedDomains).toEqual([`applinks:${table.host}`, `webcredentials:${table.host}`]);
  });
});

describe('a claimed address opens the app\'s own page', () => {
  const at = (path: string) => `https://${table.host}${path}`;

  it.each([
    ['/film/603', '/film/603'],
    ['/log/0b5e6c2a-3f1d-4c6e-9a7b-2d8f1e4c5a6b', '/log/0b5e6c2a-3f1d-4c6e-9a7b-2d8f1e4c5a6b'],
    ['/lists/0b5e6c2a-3f1d-4c6e-9a7b-2d8f1e4c5a6b', '/stacks/0b5e6c2a-3f1d-4c6e-9a7b-2d8f1e4c5a6b'],
    ['/stacks/9', '/stacks/9'],
    ['/user/morpho', '/user/morpho'],
    ['/user/morpho/diary', '/user/morpho?tab=ledger'],
    ['/user/morpho/lists', '/user/morpho?tab=lists'],
    ['/lounge', '/lounge'],
    ['/lounge/r1', '/lounge/r1'],
    ['/person/31', '/person/31'],
    ['/dispatch', '/dispatch'],
    ['/dispatch/compose', '/dispatch/compose'],
    ['/discover', '/darkroom'],
    ['/feed', '/'],
    ['/patronage', '/membership'],
    ['/society', '/membership'],
    ['/year-in-cinema', '/year-in-cinema'],
    ['/tribunal', '/tribunal'],
  ])('%s is %s', (web, app) => {
    expect(appPathOf(at(web))).toBe(app);
    expect(redirectSystemPath({ path: at(web), initial: true })).toBe(app);
  });

  it('reads a closing slash, the bare host, and the address\'s query and fragment as the same page', () => {
    expect(appPathOf(at('/film/603/'))).toBe('/film/603');
    expect(appPathOf('https://thereelhousesociety.com/film/603')).toBe('/film/603');
    expect(appPathOf(`https://${table.host.toUpperCase()}/film/603`)).toBe('/film/603');
    expect(appPathOf(at('/film/603?ref=share#cast'))).toBe('/film/603');
  });

  it('claims no page the website keeps, no deeper path, and no other site', () => {
    for (const web of ['/', '/privacy', '/terms', '/support', '/auth/callback', '/login', '/admin', '/lists', '/film', '/film/603/extra', '/dispatch/compose/x']) {
      expect([web, appPathOf(at(web))]).toEqual([web, null]);
    }
    expect(appPathOf(`http://${table.host}/film/603`)).toBeNull();
    expect(appPathOf('https://reelhouse.app/film/603')).toBeNull();
    expect(appPathOf(`https://${table.host}.evil.example/film/603`)).toBeNull();
  });

  it('passes every other link on as it came: the app\'s own, and a kept page of the house', () => {
    expect(redirectSystemPath({ path: 'reelhouse://auth-callback?code=abc', initial: true })).toBe('reelhouse://auth-callback?code=abc');
    expect(redirectSystemPath({ path: 'reelhouse://film/603', initial: false })).toBe('reelhouse://film/603');
    expect(redirectSystemPath({ path: at('/privacy'), initial: false })).toBe(at('/privacy'));
  });
});

describe('the website\'s two link files, made from the same list', () => {
  const { appleFile, androidFile } = require('../house-link-files.cjs');
  const TEAM = 'ABCDE12345';
  const SHA = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).toUpperCase().padStart(2, '0')).join(':');

  it('the iPhone\'s claims exactly the claimed paths, for this app, and shares its passwords', () => {
    const file = appleFile(TEAM);
    expect(file.webcredentials).toEqual({ apps: [`${TEAM}.${appJson.ios.bundleIdentifier}`] });
    expect(file.applinks.details).toHaveLength(1);
    expect(file.applinks.details[0].appIDs).toEqual([`${TEAM}.com.reelhouse.society`]);
    const paths = file.applinks.details[0].components.map((c: Record<string, string>) => c['/']);
    // The same claims as Android's: an exact path is that path, a prefix is everything under it.
    const android = appJson.android.intentFilters[0].data.map((d: Record<string, string>) => d.path ?? `${d.pathPrefix}*`);
    expect(paths).toEqual(android);
    expect(paths.filter((p: string) => p === '/' || p === '/*')).toEqual([]);
  });

  it('Android\'s names this app, signed with the key given, for its links and its passwords', () => {
    expect(androidFile(SHA)).toEqual([{
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: { namespace: 'android_app', package_name: appJson.android.package, sha256_cert_fingerprints: [SHA] },
    }]);
  });

  it('refuses to make either without the owner\'s real values', () => {
    for (const team of [undefined, '', 'abcde12345', 'ABCDE1234', 'TEAMID']) expect(() => appleFile(team)).toThrow(/Team ID/);
    for (const sha of [undefined, '', SHA.toLowerCase(), SHA.slice(3), SHA.replace(/:/g, '')]) expect(() => androidFile(sha)).toThrow(/SHA-256/);
  });
});

describe('no link goes unread', () => {
  it('a link that is not an address at all is passed on as it came, never lost', () => {
    for (const path of ['', '/film/603', 'not a link', 'https://']) {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
    }
  });
});
