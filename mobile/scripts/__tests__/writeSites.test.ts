/**
 * writeSites.test.ts — mobile/e2e/write-sites.json holds every place the app writes to the house, as
 * scripts/write-sites.cjs finds them, and nothing gone; and the finder finds each shape of write and no read.
 */
import { readFileSync } from 'fs';
import * as ts from 'typescript';

type Site = { key: string; file: string; name: string; does: string; target: string; area: string | null };
const ws = require('../../scripts/write-sites.cjs') as {
  writeSites: () => (Site & { line: number })[];
  sitesIn: (t: typeof ts, text: string, rel: string, o: { writes: { set: Set<string>; known: Set<string> }; edgeWrites: Set<string> & { known: Set<string> } }) => { name: string; does: string; target: string }[];
  functionBodies: (sql: string[]) => Map<string, string>;
  writingFunctions: (bodies: Map<string, string>) => Set<string>;
  KEPT: string;
};

describe('the kept list of write sites', () => {
  const now = ws.writeSites();
  const kept = (JSON.parse(readFileSync(ws.KEPT, 'utf8')) as { sites: Site[] }).sites;

  it('found the app writing, rather than an empty list matching an empty file', () => {
    expect(now.length).toBeGreaterThan(100);
    expect(now.map((s) => s.does)).toEqual(expect.arrayContaining(['insert', 'update', 'upsert', 'delete', 'rpc', 'invoke', 'storage.upload']));
  });

  it('holds every write site the app has, and none it no longer has (node mobile/scripts/write-sites.cjs --write)', () => {
    const keys = new Set(kept.map((s) => s.key));
    const found = new Set(now.map((s) => s.key));
    expect({ missing: now.filter((s) => !keys.has(s.key)).map((s) => s.key), gone: kept.filter((s) => !found.has(s.key)).map((s) => s.key) }).toEqual({ missing: [], gone: [] });
  });

  it('gives each site an area of the deep pass', () => {
    expect(kept.filter((s) => !s.area).map((s) => s.key)).toEqual([]);
  });
});

describe('the finder', () => {
  const writes = { set: new Set(['save_thing']), known: new Set(['save_thing', 'read_thing']) };
  const edgeWrites = Object.assign(new Set(['sync-films']), { known: new Set(['sync-films', 'tmdb-proxy']) });
  const text = [
    'export async function keep(t: string) {',
    "  await supabase.from('logs').insert({ a: 1 });",
    "  await supabase.from('logs').update({ a: 2 }).eq('id', 1);",
    '  await supabase.from(t).upsert([]);',
    "  await supabase.from('logs').delete().eq('id', 1);",
    "  await supabase.from('logs').select('*');",
    '  seen.delete(t);',
    "  await supabase.storage.from('avatars').upload('p', b);",
    "  await supabase.rpc('save_thing', {});",
    "  await supabase.rpc('read_thing');",
    "  await supabase.rpc('not_in_the_schema');",
    "  await supabase.functions.invoke('sync-films');",
    "  await supabase.functions.invoke('tmdb-proxy');",
    '}',
  ].join('\n');

  it('finds each shape of write by its function, and no read', () => {
    expect(ws.sitesIn(ts, text, 'x.ts', { writes, edgeWrites }).map((s) => `${s.name} ${s.does} ${s.target}`)).toEqual([
      'keep insert logs', 'keep update logs', 'keep upsert ?', 'keep delete logs', 'keep storage.upload avatars',
      'keep rpc save_thing', 'keep rpc not_in_the_schema', 'keep invoke sync-films',
    ]);
  });

  it('counts a function as writing when its newest body writes, or calls one that does', () => {
    const bodies = ws.functionBodies([
      'CREATE FUNCTION public.a() RETURNS void LANGUAGE sql AS $$ select 1 $$;\nCREATE FUNCTION public.b() RETURNS void LANGUAGE sql AS $$ select a() $$;',
      'CREATE OR REPLACE FUNCTION public.a() RETURNS void LANGUAGE plpgsql AS $fn$ begin update logs set x = 1; end $fn$;\nCREATE FUNCTION public.c() RETURNS void LANGUAGE sql AS $$ select 1 from logs for update $$;',
    ]);
    expect([...ws.writingFunctions(bodies)].sort()).toEqual(['a', 'b']);
  });
});
