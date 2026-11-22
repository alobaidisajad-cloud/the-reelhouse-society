/**
 * Every read the app makes through a house function is timed and shaped by the load lab (the kinds pass,
 * kind 13: a cost never measured; built for millions).
 * ─────────────────────────────────────────────────────────────────────────────
 * The load lab (e2e/load/probe.mjs) holds each busy read to a budget and to a shape that stays the size of
 * its answer as the house grows. A read it never runs is held to nothing: the profile's calendar read the
 * whale's whole record for a year's grid, and nothing measured it. So every app file's syntax tree is read
 * for each call of `.rpc(`; each function named is found in the house as production will hold it (the
 * snapshot and every pending migration, scripts/write-sites.cjs); and each that only reads is a probe of
 * probe.mjs, or is judged here with why it is not. A call whose function is not written in the code, or not
 * found in the house, is refused: it cannot be judged.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { files } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const { databaseSql, functionBodies, writingFunctions } = require('../../../scripts/write-sites.cjs') as {
  databaseSql: () => string[];
  functionBodies: (sql: string[]) => Map<string, string>;
  writingFunctions: (bodies: Map<string, string>) => Set<string>;
};

/** Each `.rpc(` call of one file's text: the function it names, or null when the name is not written there. */
export function rpcCalls(text: string, file = 'planted.ts'): (string | null)[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: (string | null)[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'rpc' && n.arguments.length) {
      const a = n.arguments[0];
      out.push(a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The house functions probe.mjs runs: each `public.<name>(` inside its PROBES list. */
export function probedIn(probeText: string): Set<string> {
  const start = probeText.indexOf('const PROBES = [');
  const list = start < 0 ? '' : probeText.slice(start, probeText.indexOf('\n];', start));
  return new Set([...list.matchAll(/public\.(\w+)\(/g)].map((m) => m[1] ?? ''));
}

/** What is wrong with the app's reads: each read neither probed nor judged, each name not found or not written. */
export function readFaults(calls: Map<string, string[]>, bodies: Map<string, string>, writes: Set<string>, probed: Set<string>, judged: Record<string, string>): string[] {
  const faults: string[] = [];
  for (const [name, where] of calls) {
    if (name === '') faults.push(`a call whose function is not written in the code: ${where.join(', ')}`);
    else if (!bodies.has(name)) faults.push(`${name}: not found in the house (${where.join(', ')})`);
    else if (!writes.has(name) && !probed.has(name) && !(name in judged)) faults.push(`${name}: a read with no probe in e2e/load/probe.mjs and no judgment (${where.join(', ')})`);
  }
  for (const name of Object.keys(judged)) {
    if (!calls.has(name)) faults.push(`${name}: judged, but the app no longer calls it`);
    else if (writes.has(name)) faults.push(`${name}: judged as a read, but it writes`);
    else if (probed.has(name)) faults.push(`${name}: judged, but probed now: take the judgment out`);
  }
  return faults;
}

/**
 * The reads the load lab does not run, each with why. "owed" is a read whose rows the load house does not
 * plant yet (e2e/load/seed.sql): a probe over an empty table would pass whatever its plan, so the seed owes
 * its rows first and the probe follows them.
 */
const JUDGED: Record<string, string> = {
  increment_dossier_views: 'does nothing: its body only returns (a dossier\'s views are not counted)',
};

const bodies = functionBodies(databaseSql());
const writes = writingFunctions(bodies);
const probed = probedIn(readFileSync(join(MOBILE, 'e2e', 'load', 'probe.mjs'), 'utf8'));
const calls = new Map<string, string[]>();
for (const f of files('appCode').filter((p: string) => /\.(tsx?|jsx?)$/.test(p))) {
  const rel = relative(ROOT, f).split('\\').join('/');
  for (const name of rpcCalls(readFileSync(f, 'utf8'), rel)) {
    const key = name === null ? '' : name.toLowerCase();
    calls.set(key, [...new Set([...(calls.get(key) ?? []), rel])]);
  }
}

it('finds every house function the app calls, and whether it writes', () => {
  expect(calls.size).toBeGreaterThan(60);
  expect(calls.has('get_my_follows') && !writes.has('get_my_follows')).toBe(true);
  expect(writes.has('save_stack')).toBe(true);
  expect(probed.has('search_members')).toBe(true);
});

it('probes every read the app makes through a house function, or judges why not', () => {
  expect(readFaults(calls, bodies, writes, probed, JUDGED)).toEqual([]);
});

it('says no to a read with no probe, a name not written or not in the house, and a judgment gone stale', () => {
  expect(rpcCalls("await supabase.rpc('calendar_days', { p_user_id: id }); await supabase.rpc(fn);")).toEqual(['calendar_days', null]);
  expect([...probedIn("const PROBES = [\n  { sql: 'SELECT public.get_lobby()' },\n];\nconst x = 'public.not_a_probe()';")]).toEqual(['get_lobby']);
  const house = new Map([['calendar_days', 'select'], ['save_stack', 'insert'], ['get_lobby', 'select'], ['old_read', 'select']]);
  const planted = new Map([['calendar_days', ['a.ts']], ['save_stack', ['b.ts']], ['get_lobby', ['c.ts']], ['', ['d.ts']], ['gone_fn', ['e.ts']]]);
  expect(readFaults(planted, house, new Set(['save_stack']), new Set(['get_lobby']), { old_read: 'x', save_stack: 'x', get_lobby: 'x' })).toEqual([
    'calendar_days: a read with no probe in e2e/load/probe.mjs and no judgment (a.ts)',
    'a call whose function is not written in the code: d.ts',
    'gone_fn: not found in the house (e.ts)',
    'old_read: judged, but the app no longer calls it',
    'save_stack: judged as a read, but it writes',
    'get_lobby: judged, but probed now: take the judgment out',
  ]);
});
