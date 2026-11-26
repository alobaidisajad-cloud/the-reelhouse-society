/**
 * Every edge function has one copy, and scripts/edge-functions.cjs says where.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two folders deploy to the same project. When both held a function of the
 * same name, reading the repo did not tell you what ran — and the copy that
 * handed out the TMDB key was the one nobody was reading. `npm run
 * functions:check` compares the list with what is deployed; this keeps the
 * list honest about the folders.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { files as universe, repoRel } from '@/test-utils/universe';

const fns = require('../../../scripts/edge-functions.cjs') as {
  WEB: string;
  MOBILE: string;
  DEPLOYED: Record<string, { dir: string; verifyJwt: boolean }>;
  NOT_DEPLOYED: Record<string, { dir: string; why: string }>;
  deployCommand: (name: string) => string;
};

const REPO = join(__dirname, '..', '..', '..', '..');
/** The function folders in one tree, from every edge function file test-utils/universe.js names. */
const folders = (dir: string) =>
  [...new Set(universe('functions').map(repoRel).filter((r) => r.startsWith(`${dir}/`))
    .map((r) => r.slice(dir.length + 1).replace(/\/.*$/, '')))]
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'));

const listed = { ...fns.DEPLOYED, ...fns.NOT_DEPLOYED };

it('no function is in both folders', () => {
  const web = folders(fns.WEB);
  expect(folders(fns.MOBILE).filter((n) => web.includes(n))).toEqual([]);
});

it('every function folder is listed, with the folder it is really in', () => {
  const onDisk = [...folders(fns.WEB).map((n) => [n, fns.WEB] as const), ...folders(fns.MOBILE).map((n) => [n, fns.MOBILE] as const)];
  expect(onDisk.length).toBeGreaterThan(5);
  expect(onDisk.filter(([n, dir]) => listed[n]?.dir !== dir)).toEqual([]);
});

it('every listed function has its code where the list says', () => {
  expect(Object.entries(listed).filter(([n, { dir }]) => !existsSync(join(REPO, dir, n, 'index.ts'))).map(([n]) => n)).toEqual([]);
});

it('nothing is both deployed and not deployed, and every exception says why', () => {
  expect(Object.keys(fns.NOT_DEPLOYED).filter((n) => n in fns.DEPLOYED)).toEqual([]);
  expect(Object.values(fns.NOT_DEPLOYED).filter(({ why }) => why.length < 20)).toEqual([]);
});

it('the printed deploy command carries --no-verify-jwt exactly when the function must be open', () => {
  const wrong = Object.entries(fns.DEPLOYED).filter(([n, { verifyJwt }]) =>
    fns.deployCommand(n).includes('--no-verify-jwt') === verifyJwt);
  expect(wrong.map(([n]) => n)).toEqual([]);
  expect(fns.deployCommand('fetch-rss')).toMatch(/^cd mobile; /);
  expect(fns.deployCommand('tmdb-proxy')).toMatch(/^cd \.; /);
});

// A function is deployed only after the house holds what it calls: deployed before its car's train, its
// call finds nothing to ask (sync-entitlement and 20261125_10 answered 502 there). functions:check prints
// no command for one that waits, and one naming what no car makes is refused here.
describe('a function waits for the car that makes what it calls', () => {
  const waiting = fns as unknown as {
    namedObjects: (name: string, root: string) => string[];
    waitsFor: (name: string, root?: string) => { object: string; car: string | null }[];
    deployCommand: (name: string, root?: string) => string;
  };

  it('every function names only what production holds, or what a pending car makes', () => {
    const never = Object.keys(listed).flatMap((n) => waiting.waitsFor(n).filter((w) => w.car === null).map((w) => `${n}: ${w.object}`));
    expect(never).toEqual([]);
  });

  it('reads what a function asks of the house, its shared code included, and no storage bucket', () => {
    expect(waiting.namedObjects('revenuecat-webhook', REPO)).toEqual(expect.arrayContaining(['claim_founding_seat', 'grant_entitlement']));
    expect(waiting.namedObjects('notify-push', REPO)).toEqual(expect.arrayContaining(['notifications', 'push_tokens', 'push_tokens_of']));
  });

  it('refuses the command for a function whose call a pending car makes, and names that car', () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-waits-'));
    const put = (rel: string, text: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
    put('mobile/supabase/schema/live-schema.sql', 'CREATE FUNCTION public.grant_entitlement(p uuid) RETURNS void\n');
    put('mobile/supabase/APPLIED.txt', '20260101_01_old.sql\n');
    put('supabase/migrations/20260101_01_old.sql', 'CREATE FUNCTION public.long_gone() RETURNS void\n');
    put('supabase/migrations/20261125_10_paced.sql', 'CREATE FUNCTION public.a_members_call_is_paced(p uuid, k text) RETURNS void\n');
    put('mobile/supabase/functions/sync-entitlement/index.ts',
      "await admin.rpc('a_members_call_is_paced', {}); await admin.rpc('grant_entitlement', {}); await admin.storage.from('avatars');\n");
    try {
      expect(waiting.waitsFor('sync-entitlement', root)).toEqual([{ object: 'a_members_call_is_paced', car: '20261125_10_paced.sql' }]);
      expect(waiting.deployCommand('sync-entitlement', root)).toMatch(/^NOT YET: sync-entitlement calls a_members_call_is_paced \(made by 20261125_10_paced\.sql/);
      put('mobile/supabase/APPLIED.txt', '20260101_01_old.sql\n20261125_10_paced.sql\n');
      expect(waiting.waitsFor('sync-entitlement', root)).toEqual([{ object: 'a_members_call_is_paced', car: null }]);
      put('mobile/supabase/schema/live-schema.sql', 'CREATE FUNCTION public.grant_entitlement(p uuid) RETURNS void\nCREATE FUNCTION public.a_members_call_is_paced(p uuid, k text) RETURNS void\n');
      expect(waiting.deployCommand('sync-entitlement', root)).toMatch(/^cd mobile; npx supabase functions deploy sync-entitlement/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
