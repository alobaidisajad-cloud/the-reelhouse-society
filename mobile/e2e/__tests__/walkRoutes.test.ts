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
  expect(steps[0]).toEqual({ file: 'app/(modals)/login.tsx', link: '/login', as: 'guest' });
  expect(steps.slice(1).every((s) => s.as === 'member')).toBe(true);
  expect(steps.find((s) => s.file === 'app/dispatch/series/[id].tsx')?.link).toBe('/dispatch/series/s-1');
  expect(steps.find((s) => s.file === 'app/(modals)/cover-picker.tsx')?.link).toBe('/cover-picker?loungeId=lo-1');
  expect(steps.filter((s) => /\{/.test(s.link))).toEqual([]);
  expect(() => ask(`m.plan({ 'app/x.tsx': { link: '/x/{nothing}' } }, {})`)).toThrow(/app\/x\.tsx: no id for \{nothing\}/);
});

it('writes a flow that clears the app, signs in once before the member\'s first route, and opens each cold and captures it', () => {
  const flow = ask(`m.flowOf([{ file: 'app/(modals)/login.tsx', link: '/login', as: 'guest' }, { file: 'app/film/[id].tsx', link: '/film/129', as: 'member' }, { file: 'app/(tabs)/index.tsx', link: '/', as: 'member' }], '/x/sign_in.yaml')`) as string;
  expect(flow.split('\n').filter(Boolean)).toEqual([
    'appId: com.reelhouse.society', '---', '- launchApp:', '    clearState: true',
    '# app/(modals)/login.tsx', '- stopApp', '- openLink: "reelhouse://login"', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "01-modals-login"',
    '- runFlow: "/x/sign_in.yaml"',
    '# app/film/[id].tsx', '- stopApp', '- openLink: "reelhouse://film/129"', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "02-film-id"',
    '# app/(tabs)/index.tsx', '- stopApp', '- openLink: "reelhouse://"', '- waitForAnimationToEnd:', '    timeout: 8000', '- takeScreenshot: "03-tabs-index"',
  ]);
});

it('refuses to walk anything but a local stack, and says what it needs', () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [SCRIPT, 'out'], { encoding: 'utf8', env: { ...process.env, ...env } });
  expect(run({ API_URL: 'https://x.supabase.co', SERVICE_ROLE_KEY: 'k' }).stderr).toMatch(/Refusing to walk https:\/\/x\.supabase\.co/);
  const bare = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, API_URL: '', SERVICE_ROLE_KEY: '' } });
  expect([bare.status, bare.stderr]).toEqual([2, expect.stringMatching(/^usage: node e2e\/walk-routes\.mjs/)]);
});
