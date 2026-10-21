/**
 * walkRoutes.test.ts — the route walk's plan (e2e/walk-routes.mjs): every route of e2e/routes.json
 * with its ids read back from the seeded world by name, an alias's link opened once, the guests'
 * routes first; a flow that clears the app, signs the member in once before their first route,
 * and opens each route cold and captures it; and a seed that made no row stops the walk by name.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { routeMarkOf } from '@/src/components/layout/E2ERouteMark';

const SCRIPT = join(__dirname, '..', 'walk-routes.mjs');
const ROUTES = (JSON.parse(readFileSync(join(__dirname, '..', 'routes.json'), 'utf8')) as { routes: Record<string, unknown> }).routes;

/** One of the script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(await (async () => ${expression})()));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};

/** What the seeded world answers, by the paths the walk asks. */
const WORLD = `async (path) => {
  if (path.includes('profiles')) return [{ id: 'm-1' }];
  if (path.includes('title=eq.E2E%20walk%20essay')) return [{ id: 'd-1', series_id: 's-1' }];
  if (path.includes('dispatch_posts')) return [{ id: 'f-1' }];
  if (path.includes('/lists')) return [{ id: 'st-1' }];
  if (path.includes('/logs')) return [{ id: 'l-1' }];
  if (path.includes('/lounges')) return [{ id: 'lo-1' }];
  return [];
}`;

it('reads every id from the seeded world by the names the seed gave, and the recorded film and person', () => {
  expect(ask(`m.readIds(${WORLD})`)).toEqual({
    member: 'e2e_member', filing: 'f-1', stack: 'st-1', log: 'l-1', lounge: 'lo-1', dossier: 'd-1', series: 's-1', film: '129', person: '608',
  });
});

it('stops, naming the row, when the seed made none', () => {
  expect(() => ask(`m.readIds(async (path) => path.includes('lounges') ? [] : (${WORLD})(path))`)).toThrow(/the seed made no open Lounge \(E2E_SEED_WALK\)/);
  expect(() => ask(`m.readIds(async (path) => path.includes('essay') ? [{ id: 'd-1' }] : (${WORLD})(path))`)).toThrow(/no essay in a series/);
});

it('plans every route once, an alias with it, its ids filled in, the guests first', () => {
  const ids = ask(`m.readIds(${WORLD})`) as Record<string, string>;
  const steps = ask(`m.plan(${JSON.stringify(ROUTES)}, ${JSON.stringify(ids)})`) as { file: string; link: string; as: string }[];
  expect(steps).toHaveLength(Object.keys(ROUTES).length - 1);
  expect(steps.filter((s) => s.link === '/lounge')).toHaveLength(1);
  expect(steps[0]).toEqual({ file: 'app/(modals)/login.tsx', link: '/login', lands: '/login', as: 'guest' });
  // Where a route lands: its own path without its query, or the path its `lands` names.
  expect(steps.find((s) => s.file === 'app/(modals)/cover-picker.tsx')).toMatchObject({ lands: '/cover-picker' });
  const sent = ask(`m.plan({ 'app/a.tsx': { link: '/a/{film}', lands: '/b/{film}' } }, { film: '9' })`);
  expect(sent).toEqual([{ file: 'app/a.tsx', link: '/a/9', lands: '/b/9', as: 'member' }]);
  // A tap after the link travels with its route, and only there: the Lobby, reached by its tab (lastTab.ts).
  expect(steps.filter((s) => 'then' in s)).toEqual([{ file: 'app/(tabs)/index.tsx', link: '/', lands: '/', as: 'member', then: 'home-tab' }]);
  expect(steps.slice(1).every((s) => s.as === 'member')).toBe(true);
  expect(steps.find((s) => s.file === 'app/dispatch/series/[id].tsx')?.link).toBe('/dispatch/series/s-1');
  expect(steps.find((s) => s.file === 'app/(modals)/cover-picker.tsx')?.link).toBe('/cover-picker?loungeId=lo-1');
  expect(steps.filter((s) => /\{/.test(s.link))).toEqual([]);
  expect(() => ask(`m.plan({ 'app/x.tsx': { link: '/x/{nothing}' } }, {})`)).toThrow(/app\/x\.tsx: no id for \{nothing\}/);
});

it('writes a flow that clears the app, signs in once before the member\'s first route, opens each cold, taps on where a route says to, and captures it', () => {
  const flow = ask(`m.flowOf([{ file: 'app/(modals)/login.tsx', link: '/login', as: 'guest' }, { file: 'app/film/[id].tsx', link: '/film/129', as: 'member' }, { file: 'app/(tabs)/index.tsx', link: '/', as: 'member', then: 'home-tab' }], '/x/sign_in.yaml')`) as string;
  expect(flow.split('\n').filter(Boolean)).toEqual([
    'appId: com.reelhouse.society', '---', '- launchApp:', '    clearState: true',
    '# app/(modals)/login.tsx', '- stopApp', '- openLink: "reelhouse://login"', '- extendedWaitUntil:', '    visible:', '      id: "e2e-route-login"', '    timeout: 30000', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "01-modals-login"',
    // From the app's own start: the login modal the guest's last route opened covers the tabs.
    '- stopApp', '- launchApp', '- runFlow: "/x/sign_in.yaml"',
    '# app/film/[id].tsx', '- stopApp', '- openLink: "reelhouse://film/129"', '- extendedWaitUntil:', '    visible:', '      id: "e2e-route-film-129"', '    timeout: 30000', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "02-film-id"',
    '# app/(tabs)/index.tsx', '- stopApp', '- openLink: "reelhouse://"',
    // Any route's mark first, then the tab: the app has reopened the member's last tab by then.
    '- extendedWaitUntil:', '    visible:', '      id: "e2e-route(-.+)?"', '    timeout: 30000', '- tapOn:', '    id: "home-tab"',
    '- extendedWaitUntil:', '    visible:', '      id: "e2e-route"', '    timeout: 30000', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "03-tabs-index"',
  ]);
});

it('plans each moment after every route, as the member, its link filled in, and walks it: its mark, each tap once, what shows, then the capture', () => {
  const moments = { 'the calendar': { link: '/film/{film}', taps: [{ id: 'film-stub' }, { text: 'FILED.*' }], shows: { text: 'CLOSE' } }, 'the keyboard': { link: '/darkroom', taps: [{ id: 'k' }], part: 'above-keyboard' } };
  const steps = ask(`m.plan({ 'app/a.tsx': { link: '/a', as: 'guest' }, 'app/b.tsx': { link: '/b' } }, { film: '129' }, ${JSON.stringify(moments)})`) as { file: string }[];
  expect(steps).toEqual([
    { file: 'app/a.tsx', link: '/a', lands: '/a', as: 'guest' },
    { file: 'app/b.tsx', link: '/b', lands: '/b', as: 'member' },
    { file: 'moment: the calendar', link: '/film/129', lands: '/film/129', as: 'member', taps: moments['the calendar'].taps, shows: { text: 'CLOSE' } },
    { file: 'moment: the keyboard', link: '/darkroom', lands: '/darkroom', as: 'member', taps: [{ id: 'k' }], part: 'above-keyboard' },
  ]);
  expect(() => ask(`m.plan({}, {}, { 'the x': { link: '/x/{nothing}', taps: [] } })`)).toThrow(/moment: the x: no id for \{nothing\}/);
  const flow = ask(`m.flowOf([${JSON.stringify(steps[2])}], '/x/sign_in.yaml')`) as string;
  expect(flow.split('\n').filter(Boolean).slice(7)).toEqual([
    '# moment: the calendar', '- stopApp', '- openLink: "reelhouse://film/129"',
    '- extendedWaitUntil:', '    visible:', '      id: "e2e-route-film-129"', '    timeout: 30000',
    '- scrollUntilVisible:', '    element:', '      id: "film-stub"', '    direction: DOWN', '    timeout: 60000',
    '- tapOn:', '    id: "film-stub"', '    retryTapIfNoChange: false',
    '- scrollUntilVisible:', '    element:', '      text: "FILED.*"', '    direction: DOWN', '    timeout: 60000',
    '- tapOn:', '    text: "FILED.*"', '    retryTapIfNoChange: false',
    '- extendedWaitUntil:', '    visible:', '      text: "CLOSE"', '    timeout: 15000',
    '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "01-moment-the-calendar"',
  ]);
});

it('turns the keyboard on for a moment that asks for it, before its link, and off after its capture', () => {
  const step = { file: 'moment: the keyboard', link: '/darkroom', lands: '/darkroom', as: 'member', taps: [{ id: 'k' }], part: 'above-keyboard', keyboard: true };
  expect(ask(`m.plan({}, {}, { 'the keyboard': { link: '/darkroom', taps: [{ id: 'k' }], part: 'above-keyboard', keyboard: true } })`)).toEqual([step]);
  const lines = (ask(`m.flowOf([${JSON.stringify(step)}], '/x/subflows/sign_in.yaml')`) as string).split('\n').filter(Boolean).slice(7);
  const on = ['- runFlow:', '    file: "/x/subflows/phone.yaml"', '    env:', '      SET: keyboard', '      TO: "true"'];
  const off = ['- runFlow:', '    file: "/x/subflows/phone.yaml"', '    env:', '      SET: keyboard', '      TO: "false"'];
  expect(lines.slice(0, 7)).toEqual(['# moment: the keyboard', ...on, '- stopApp']);
  expect(lines.slice(-6)).toEqual(['- takeScreenshot: "01-moment-the-keyboard"', ...off]);
});

it("waits for the very mark the app draws for each path (src/components/layout/E2ERouteMark.tsx)", () => {
  const paths = ['/', '/login', '/film/129', '/dispatch/room/e2e_member', '/cover-picker?loungeId=lo-1', '/user/a.b-c'];
  const walk = ask(`${JSON.stringify(paths)}.map(m.markOf)`);
  const app = paths.map((path) => routeMarkOf(path.split('?')[0] ?? ''));
  expect(walk).toEqual(app);
  expect(app).toEqual(['e2e-route', 'e2e-route-login', 'e2e-route-film-129', 'e2e-route-dispatch-room-e2e-member', 'e2e-route-cover-picker', 'e2e-route-user-a-b-c']);
});

it('refuses to walk anything but a local stack, and says what it needs', () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [SCRIPT, 'out'], { encoding: 'utf8', env: { ...process.env, ...env } });
  expect(run({ API_URL: 'https://x.supabase.co', SERVICE_ROLE_KEY: 'k' }).stderr).toMatch(/Refusing to walk https:\/\/x\.supabase\.co/);
  const bare = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, API_URL: '', SERVICE_ROLE_KEY: '' } });
  expect([bare.status, bare.stderr]).toEqual([2, expect.stringMatching(/^usage: node e2e\/walk-routes\.mjs/)]);
});
