/**
 * aPreferenceIsSentByItsKey.guard.test.ts — every preferences write names the keys it changed.
 *
 * The house merges preferences key by key (update_my_preferences). A write carrying the phone's
 * whole copy put back every key another device had changed since this phone read it: the
 * favourites and the backdrop sent their changed key live, and queued the whole copy offline;
 * a setting toggled queued the whole copy too (auth.ts now keeps its pending keys alone). Every
 * send and every queued write is read here: its preferences are an object naming its keys, or the
 * pending keys (auth.ts), or the queued payload replayed as it was queued (mutationExecutor).
 */
import { readCode } from '@/test-utils/readCode';
import { execSync } from 'child_process';

const ROOT = `${__dirname}/../../..`;
const files = execSync('git ls-files -- src app', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));

/** Each write: the file, and what its preferences are, as written. */
const writes = files.flatMap((file) => {
  const code = readCode(file);
  const sends = [...code.matchAll(/rpc\('update_my_preferences',\s*\{\s*p_preferences:\s*([^}\s,]+)/g)].map((m) => ({ file, as: m[1] }));
  const queued = [...code.matchAll(/type:\s*'update_profile',\s*payload:\s*\{[^]*?preferences:\s*([^}\s,]+)/g)].map((m) => ({ file, as: m[1] }));
  return [...sends, ...queued];
});

/** The two that pass on keys chosen elsewhere: the pending keys alone, and the queued write replayed. */
const PASSED_ON: Record<string, string> = {
  'src/stores/auth.ts': 'pending',
  'src/utils/mutationExecutor.ts': 'preferences',
};

it('reads the app’s preferences writes', () => {
  // Two: the pending keys sent (auth.ts) and the queued write replayed (mutationExecutor). The
  // altarpiece and the backdrop write none of their own since review round 7: they go the
  // preferences' own way (savePreferences), kept pending offline, never queued apart.
  expect(writes.length).toBeGreaterThanOrEqual(2);
});

it('each names the keys it changed, never a whole copy', () => {
  const whole = writes.filter((w) => w.as !== '{' && PASSED_ON[w.file] !== w.as);
  expect(whole).toEqual([]);
});
