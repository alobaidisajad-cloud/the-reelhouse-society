/**
 * @jest-environment node
 */
/**
 * aTestNeverShipsAsAScreen.guard.test.ts — no test file under app/ goes into
 * the phone's bundle as a screen.
 *
 * expo-router makes a route of every code file under app/: its pattern has no
 * exception for tests. A test file there stays out of the bundle only because
 * Metro's blockList skips it, and Metro's own default skips a path inside a
 * __tests__ folder, nothing else (a test beside the screens, or a __mocks__
 * folder, would ship). So every test file under app/ must be one the blockList
 * skips, and no route file may be one.
 */
import { join } from 'path';
import { MOBILE } from '@/test-utils/readCode';
import { files as universe, rel } from '@/test-utils/universe';

const metro = require(join(MOBILE, 'metro.config.js')) as { resolver: { blockList: RegExp | RegExp[] } };
const rules = [metro.resolver.blockList].flat();
/** Whether Metro leaves this file out, read as Metro reads it: the absolute path, with this system's separators. */
const skipped = (abs: string) => rules.some((r) => r.test(abs));

const { EXPO_ROUTER_CTX_IGNORE } = require(require.resolve('expo-router/_ctx-shared.js', { paths: [MOBILE] })) as { EXPO_ROUTER_CTX_IGNORE: RegExp };
/** Whether expo-router would take this file under app/ for a route. */
const routerTakes = (abs: string) => EXPO_ROUTER_CTX_IGNORE.test(`./${rel(abs).replace(/^app\//, '')}`);

const testsInApp = universe('appTests').filter((f) => rel(f).startsWith('app/') && routerTakes(f));

it('leaves every test file under app/ out of the bundle', () => {
  expect(testsInApp.length).toBeGreaterThan(10);
  expect(testsInApp.filter((f) => !skipped(f)).map(rel)).toEqual([]);
});

it('leaves out no route file', () => {
  const routes = universe('routes');
  expect(routes.length).toBeGreaterThan(30);
  expect(routes.filter(skipped).map(rel)).toEqual([]);
});

it('can say no: a test beside the screens, or in a __mocks__ folder, would be taken for a screen and kept', () => {
  for (const planted of [join(MOBILE, 'app', 'log', 'theRecordReadsTrue.test.tsx'), join(MOBILE, 'app', 'log', '__mocks__', 'x.tsx')]) {
    expect([rel(planted), routerTakes(planted), skipped(planted)]).toEqual([rel(planted), true, false]);
  }
  const inTests = join(MOBILE, 'app', 'log', '__tests__', 'x.test.tsx');
  expect([routerTakes(inTests), skipped(inTests)]).toEqual([true, true]);
});
