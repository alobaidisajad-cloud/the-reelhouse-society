/**
 * everyNameAClientCallsExists.test.ts — no client asks production for a table it dropped.
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch 31 dropped `vaults`, `tickets` and `programmes`. Their fetchers were
 * removed from the web's boot — and the stores, the UI and the writers were left
 * behind. So an Auteur's web profile told visitors about programmes nobody
 * could make, the film store kept an add-to-vault that could only fail, and a
 * feature-flag loader asked `app_config` (which never existed) on every visit.
 * Nothing noticed, because a missing table is an error PostgREST returns
 * quietly and every caller swallowed it.
 *
 * So both clients are held to the database as it IS: every `.from('table')`,
 * `.rpc('function')` and `storage.from('bucket')` in the mobile app and the web
 * app must name something in the committed snapshot of production —
 * supabase/schema/live-schema.sql and live-outside-public.sql, which `npm run
 * schema:check` compares against the live database. The columns each query
 * asks for are held by aQueryAsksOnlyForWhatExists.
 *
 * One allowance: the app may name what a migration not yet applied makes, since
 * the app reaches members only in a build, and the build's pre-flight refuses
 * while any such name is pending (aBuildNamesOnlyWhatProductionHas.release-test.ts).
 * The website goes live from main, so it never may.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import {
  BUCKETS, type Call, callsIn, FILES, FUNCTIONS, fromTheApp, inProduction, namesMadeIn, pendingMaker, REPO, TABLES,
} from './clientNames';

const missing = (c: Call, pending?: Parameters<typeof pendingMaker>[1]) =>
  !inProduction(c) && !(fromTheApp(c) && pendingMaker(c, pending));

describe('every table, function and bucket a client names exists in production', () => {
  const calls = FILES.flatMap(f => callsIn(relative(REPO, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')));

  it('none is missing — in the mobile app or the web app', () => {
    expect(calls.filter((c) => missing(c)).map(c => `${c.at}  ${c.kind} ${c.name}`)).toEqual([]);
  });

  it('the scan sees both clients and the snapshot is read — it cannot pass on nothing', () => {
    expect(TABLES.size).toBeGreaterThan(30);
    expect(FUNCTIONS.size).toBeGreaterThan(50);
    expect(BUCKETS.has('avatars')).toBe(true);
    expect(calls.some(c => c.at.startsWith('mobile/') && c.kind === 'rpc')).toBe(true);
    expect(calls.some(c => c.at.startsWith('src/') && c.kind === 'table')).toBe(true);
  });

  it('the detector says NO — and tells a bucket from a table across a line break', () => {
    const planted = callsIn('x.ts', [
      "supabase.from('vaults').select('*')",
      "supabase.rpc('fetch_programmes')",
      "supabase.storage\n  .from('avatars').upload(p, f)",
      "// supabase.from('in_a_comment')",
    ].join('\n'));
    expect(planted.map(c => `${c.kind} ${c.name}`)).toEqual(['table vaults', 'bucket avatars', 'rpc fetch_programmes']);
    expect(planted.filter((c) => missing(c)).map(c => c.name)).toEqual(['vaults', 'fetch_programmes']);
  });

  it('lets the app, never the website, name what a pending migration makes', () => {
    const pending = [{ name: '20990101_01_x.sql', made: namesMadeIn(
      'CREATE TABLE public.salon_typing_sent (id uuid);\nCREATE OR REPLACE FUNCTION public.send_salon_typing(p uuid)',
    ) }];
    const app: Call = { kind: 'rpc', name: 'send_salon_typing', at: 'mobile/src/stores/lounge.ts:1' };
    const site: Call = { kind: 'rpc', name: 'send_salon_typing', at: 'src/store.js:1' };
    const table: Call = { kind: 'table', name: 'salon_typing_sent', at: 'mobile/src/x.ts:1' };
    expect([missing(app, pending), missing(site, pending), missing(table, pending)]).toEqual([false, true, false]);
    expect(missing(app, [])).toBe(true);
    expect(pendingMaker(app, pending)).toBe('20990101_01_x.sql');
  });
});
