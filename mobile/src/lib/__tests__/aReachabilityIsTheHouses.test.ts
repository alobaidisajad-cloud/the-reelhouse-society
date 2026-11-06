/**
 * aReachabilityIsTheHouses.test.ts — whether the house can be reached is asked of the house.
 *
 * An iPhone's NetInfo asks Google's address each minute unless it is told otherwise; told, it
 * drops every listener added before. So reachability.ts tells it once, the house's own sign-in
 * health, and is the only file that takes NetInfo from the package.
 */
import NetInfo from '@react-native-community/netinfo';
import { readFileSync } from 'fs';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/readCode';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabase';
import { REACHABILITY_URL, RECHECK_REACHED_MS, RECHECK_UNREACHED_MS } from '../reachability';

type Asked = Parameters<typeof NetInfo.configure>[0];
const asked = (): Asked => {
  const calls = (NetInfo.configure as jest.Mock).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]![0] as Asked;
};

it('asks the house\'s sign-in health, with the house\'s key, and no other address', () => {
  expect(REACHABILITY_URL).toBe(`${SUPABASE_URL}/auth/v1/health`);
  const config = asked();
  expect(config.reachabilityUrl).toBe(REACHABILITY_URL);
  expect(config.reachabilityHeaders).toEqual({ apikey: SUPABASE_ANON_KEY });
  expect(config.reachabilityMethod).toBe('GET');
});

it('counts the house reached only when it answers that it is well', async () => {
  const test = asked().reachabilityTest!;
  await expect(test({ status: 200 } as Response)).resolves.toBe(true);
  for (const status of [204, 401, 404, 500, 503]) await expect(test({ status } as Response)).resolves.toBe(false);
});

it('asks again every ten minutes while reached and each minute while not, never every five seconds', () => {
  const config = asked();
  expect([config.reachabilityLongTimeout, config.reachabilityShortTimeout]).toEqual([RECHECK_REACHED_MS, RECHECK_UNREACHED_MS]);
  expect([RECHECK_REACHED_MS, RECHECK_UNREACHED_MS]).toEqual([600_000, 60_000]);
});

it('is the only file of the app that takes NetInfo from the package', () => {
  const direct = files('appCode')
    .filter((f) => /from '@react-native-community\/netinfo'|require\('@react-native-community\/netinfo'\)/.test(stripComments(readFileSync(f, 'utf8'), f)))
    .map(rel);
  expect(direct).toEqual(['src/lib/reachability.ts']);
});
