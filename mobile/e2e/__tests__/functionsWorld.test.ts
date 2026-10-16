/**
 * functionsWorld.test.ts — the functions world serves and asks every deployed
 * function, and stands in for every outside service they call.
 *
 * db-integration.yml's "functions" job runs e2e/functions: place.mjs serves each
 * function scripts/edge-functions.cjs says is deployed, with each outside
 * address pointed at stand-ins.mjs; warm.mjs loads each one; suites.mjs asks
 * each one. Held here, with no stack: a function deployed tomorrow is served,
 * loaded and asked, or a push fails; an outside address a function reads from
 * its settings is stood in for; no function fetches a fixed address the
 * settings cannot move; and the job runs its steps in an order that works.
 *
 * place.mjs is a module; one child process hands back what it makes.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { readCode, stripComments } from '../../test-utils/readCode';
import { files as universe, repoRel } from '../../test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const HERE = join(__dirname, '..', 'functions');
const { DEPLOYED } = require('../../scripts/edge-functions.cjs') as { DEPLOYED: Record<string, { dir: string; verifyJwt: boolean }> };
const NAMES = Object.keys(DEPLOYED).sort();
const ENTRIES = Object.entries(DEPLOYED);

const placed = (() => {
  const program = `
    const p = await import(${JSON.stringify(pathToFileURL(join(HERE, 'place.mjs')).href)});
    const config = ${JSON.stringify(readFileSync(join(__dirname, '..', 'supabase', 'config.toml'), 'utf8'))};
    const sections = p.functionSections(${JSON.stringify(DEPLOYED)});
    let refused = null;
    try { p.withSections('[a]\\n[functions.x]\\nverify_jwt = true\\n[after]\\n', ''); } catch (e) { refused = e.message; }
    console.log(JSON.stringify({ addresses: p.ADDRESSES, standIns: p.STAND_INS, sections, rewritten: p.withSections(config, sections), refused }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as { addresses: { EXPO_PUSH_URL: string; REVENUECAT_API_URL: string; TMDB_ORIGIN: string; FEED_ORIGIN: string }; standIns: string; sections: string; rewritten: string; refused: string | null };
})();

/** Every source file of a deployed function, with the shared code they import (the universe's edge functions). */
const homes = [...ENTRIES.map(([name, f]) => `${f.dir}/${name}/`), 'mobile/supabase/functions/_shared/'];
const sources = universe('functions').filter((file) => homes.some((home) => repoRel(file).startsWith(home))).map((file) => ({ file }));

/** Text as code, its comments blanked, so a URL in a comment is not read as a call. */
const code = (text: string) => stripComments(text, 'x.ts');

describe('every deployed function is served as deployed', () => {
  it('writes one section per deployed function, verify_jwt as it is deployed', () => {
    expect(placed.sections.match(/^\[functions\.[^\]]+\]$/gm)?.map((s) => s.slice(11, -1)).sort()).toEqual(NAMES);
    for (const [name, f] of ENTRIES) expect(placed.sections).toContain(`[functions.${name}]\nverify_jwt = ${f.verifyJwt}\n`);
  });

  it('replaces the sealed world\'s function sections and their comments, and keeps every other section', () => {
    const before = readFileSync(join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
    const others = (t: string) => (t.match(/^\[[^\]]+\]$/gm) ?? []).filter((s) => !s.startsWith('[functions.'));
    expect(others(placed.rewritten)).toEqual(others(before));
    expect(placed.rewritten).not.toContain('static_files');
    expect(placed.rewritten).not.toContain('The TMDB stand-in reads its recordings');
    expect(placed.rewritten.endsWith(placed.sections)).toBe(true);
    expect(placed.refused).toMatch(/\[after\] would be lost|would be lost: \[after\]/);
  });

  it('is loaded, then asked, function by function', () => {
    const warm = readFileSync(join(HERE, 'warm.mjs'), 'utf8');
    const suites = readFileSync(join(HERE, 'suites.mjs'), 'utf8');
    for (const name of NAMES) {
      expect([name, warm.includes(`['${name}', `)]).toEqual([name, true]);
      expect([name, suites.includes(`section('${name} — `)]).toEqual([name, true]);
    }
  });
});

describe('every outside service is stood in for', () => {
  it('points each outside address a function reads from its settings at the stand-ins', () => {
    for (const name of [...NAMES, '_shared']) expect([name, sources.some(({ file }) => repoRel(file).includes(`/${name}/`))]).toEqual([name, true]);
    const read = new Set<string>();
    for (const { file } of sources) {
      for (const m of readCode(file).matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)) {
        const setting = m[1] ?? '';
        if (/_(URL|ORIGIN)$/.test(setting) && setting !== 'SUPABASE_URL') read.add(setting);
      }
    }
    expect([...read].sort()).toEqual(Object.keys(placed.addresses).sort());
    for (const address of Object.values(placed.addresses)) expect(address.startsWith(placed.standIns)).toBe(true);
  });

  it('finds no fetch of a fixed outside address the settings cannot move', () => {
    const fixed = sources.filter(({ file }) => /fetch\(\s*[`'"]https?:/.test(readCode(file)));
    expect(fixed.map(({ file }) => file)).toEqual([]);
  });

  it('can say NO: a fixed address, and a setting no stand-in answers, are each found', () => {
    expect(/fetch\(\s*[`'"]https?:/.test(code("const r = await fetch('https://api.example.com/x')"))).toBe(true);
    expect(/fetch\(\s*[`'"]https?:/.test(code("// fetch('https://in.a.comment')"))).toBe(false);
    expect([...code("const A = Deno.env.get('NEW_SERVICE_URL')").matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map((m) => m[1])).toEqual(['NEW_SERVICE_URL']);
  });

  it('answers each address a stand-in serves, and anything else with 404', () => {
    const standIns = readFileSync(join(HERE, 'stand-ins.mjs'), 'utf8');
    expect(placed.addresses.EXPO_PUSH_URL.endsWith('/--/api/v2/push/send')).toBe(true);
    expect(standIns).toContain("path === '/--/api/v2/push/send'");
    expect(placed.addresses.REVENUECAT_API_URL.endsWith('/v1')).toBe(true);
    expect(standIns).toContain('/^\\/v1\\/subscribers\\/([^/]+)$/');
    expect(standIns).toContain("path.startsWith('/3/')");
    expect(standIns).toContain("path.endsWith('/rss')");
    expect(standIns).toContain('return send(res, 404, { error: `no stand-in for');
  });
});

describe('the job', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/db-integration.yml'), 'utf8');
  const job = ci.slice(ci.indexOf('\n  functions:'), ci.indexOf('\n  contracts:'));

  it('places, starts, stands in, warms, seals, builds, migrates, then asks — in that order', () => {
    const order = [
      'node mobile/e2e/functions/place.mjs',
      'bash mobile/e2e/start-stack.sh',
      'node mobile/e2e/functions/stand-ins.mjs',
      'node mobile/e2e/functions/warm.mjs',
      'bash mobile/e2e/db/seal.sh',
      'node mobile/e2e/db/bootstrap.mjs',
      'node mobile/e2e/db/up-down-up.mjs',
      'node mobile/e2e/functions/suites.mjs',
    ].map((step) => [step, job.indexOf(step)] as const);
    for (const [step, at] of order) expect([step, at > 0]).toEqual([step, true]);
    expect(order.map(([, at]) => at)).toEqual([...order.map(([, at]) => at)].sort((a, b) => a - b));
  });

  it('serves the edge runtime: the stack leaves out only what no function needs', () => {
    const start = (/bash mobile\/e2e\/start-stack\.sh ([^ ]+) /.exec(job)?.[1] ?? '').split(',').filter(Boolean);
    expect(start.length).toBeGreaterThan(0);
    for (const needed of ['edge-runtime', 'kong', 'gotrue', 'postgrest']) expect([needed, start.includes(needed)]).toEqual([needed, false]);
  });
});
