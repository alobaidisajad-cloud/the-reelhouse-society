/**
 * functionsWorld.test.ts — the functions world serves and asks every edge
 * function, and stands in for every outside service they call.
 *
 * db-integration.yml's "functions" job runs e2e/functions: place.mjs serves each
 * function scripts/edge-functions.cjs says is deployed, and the written ones it
 * names, with each outside address pointed at stand-ins.mjs; warm.mjs loads each
 * one; seal-vendors.sh then sends the real services nowhere; suites.mjs asks
 * each one. Held here, with no stack: a function written or deployed tomorrow is
 * served, loaded and asked, or named with why it is not; an outside address a
 * function reads from its settings is stood in for, and its service sealed; no
 * function fetches a fixed address the settings cannot move; and the job runs
 * its steps in an order that works.
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
type Fn = { dir: string; verifyJwt: boolean };
const { DEPLOYED, NOT_DEPLOYED } = require('../../scripts/edge-functions.cjs') as {
  DEPLOYED: Record<string, Fn>; NOT_DEPLOYED: Record<string, { dir: string; why: string }>;
};

const placed = (() => {
  const program = `
    const p = await import(${JSON.stringify(pathToFileURL(join(HERE, 'place.mjs')).href)});
    const config = ${JSON.stringify(readFileSync(join(__dirname, '..', 'supabase', 'config.toml'), 'utf8'))};
    const sections = p.functionSections(p.SERVED);
    let refused = null;
    try { p.withSections('[a]\\n[functions.x]\\nverify_jwt = true\\n[after]\\n', ''); } catch (e) { refused = e.message; }
    const mailed = p.withMail(config, p.MAIL);
    let mailRefused = null;
    try { p.withMail(config + '\\n[auth.rate_limit]\\nemail_sent = 2\\n', p.MAIL); } catch (e) { mailRefused = e.message; }
    console.log(JSON.stringify({ served: p.SERVED, notServed: p.NOT_SERVED, addresses: p.ADDRESSES, standIns: p.STAND_INS,
      sections, rewritten: p.withSections(mailed, sections), refused, mail: p.MAIL, mailed, mailRefused }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as {
    served: Record<string, Fn>; notServed: Record<string, string>;
    addresses: { EXPO_PUSH_URL: string; REVENUECAT_API_URL: string; TMDB_ORIGIN: string; FEED_ORIGIN: string; RESEND_API_URL: string };
    standIns: string; sections: string; rewritten: string; refused: string | null;
    mail: Record<string, { subject: string; file: string }>; mailed: string; mailRefused: string | null;
  };
})();
const SERVED = Object.entries(placed.served);
const NAMES = SERVED.map(([name]) => name).sort();

/** Every source file of a served function, with the shared code they import (the universe's edge functions). */
const homes = [...SERVED.map(([name, f]) => `${f.dir}/${name}/`), 'mobile/supabase/functions/_shared/'];
const sources = universe('functions').filter((file) => homes.some((home) => repoRel(file).startsWith(home))).map((file) => ({ file }));

/** Text as code, its comments blanked, so a URL in a comment is not read as a call. */
const code = (text: string) => stripComments(text, 'x.ts');

describe('every function is served as deployed, or named with why not', () => {
  it('serves every deployed function, and each written one but those named with why', () => {
    for (const name of Object.keys(DEPLOYED)) expect([name, name in placed.served]).toEqual([name, true]);
    for (const name of Object.keys(NOT_DEPLOYED)) {
      expect([name, name in placed.served !== name in placed.notServed]).toEqual([name, true]);
      if (name in placed.notServed) expect([name, (placed.notServed[name] ?? '').length > 40]).toEqual([name, true]);
    }
    expect(Object.keys(placed.notServed).filter((name) => !(name in NOT_DEPLOYED))).toEqual([]);
  });

  it('writes one section per served function, verify_jwt as it is deployed', () => {
    expect(placed.sections.match(/^\[functions\.[^\]]+\]$/gm)?.map((s) => s.slice(11, -1)).sort()).toEqual(NAMES);
    for (const [name, f] of SERVED) expect(placed.sections).toContain(`[functions.${name}]\nverify_jwt = ${f.verifyJwt}\n`);
    for (const [name, f] of Object.entries(DEPLOYED)) expect([name, placed.served[name]?.verifyJwt]).toEqual([name, f.verifyJwt]);
  });

  it('replaces the sealed world\'s function sections and their comments, and keeps every other section', () => {
    const before = readFileSync(join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
    const others = (t: string) => (t.match(/^\[[^\]]+\]$/gm) ?? []).filter((s) => !s.startsWith('[functions.'));
    // Kept, with the mail sections withMail adds (P0.80, below) and nothing else.
    const mail = (s: string) => s === '[auth.rate_limit]' || s.startsWith('[auth.email.template.');
    expect(others(placed.rewritten).filter((s) => !mail(s))).toEqual(others(before));
    expect(others(placed.rewritten).filter(mail)).toEqual(['[auth.rate_limit]', ...Object.keys(placed.mail).map((n) => `[auth.email.template.${n}]`)]);
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

describe('every outside service is stood in for, and sealed', () => {
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

  it('seals every host a function could call: each host its code names, but its imports and the house\'s own name', () => {
    const NAMED_NOT_CALLED = new Set(['deno.land', 'esm.sh', 'thereelhousesociety.com', 'www.thereelhousesociety.com']);
    const named = new Set<string>();
    for (const { file } of sources) {
      const text = readCode(file);
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/g)) named.add(m[1] ?? '');
      for (const m of text.matchAll(/'((?:www\.)?[a-z0-9-]+\.(?:com|org|net|io|host))'/g)) named.add(m[1] ?? '');
    }
    const script = readFileSync(join(HERE, 'seal-vendors.sh'), 'utf8').replace(/\r\n/g, '\n');
    const list = script.slice(script.indexOf('HOSTS=(\n') + 'HOSTS=(\n'.length, script.indexOf('\n)\n'));
    const sealed = list.split('\n').map((l) => l.trim().split(/\s+/)[0] ?? '').filter(Boolean);
    expect([...named].filter((h) => !NAMED_NOT_CALLED.has(h)).sort()).toEqual([...sealed].sort());
    expect(sealed.length).toBeGreaterThan(4);
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
    expect(standIns).toContain("path === '/emails'");
    expect(standIns).toContain('return send(res, 404, { error: `no stand-in for');
  });
});

describe('the payments replay (P0.79)', () => {
  type Ent = { product: string; ends: number | null; grace?: number; unsubscribed?: boolean };
  type Step = {
    via: 'webhook' | 'app'; as?: string; why?: string;
    event?: { type: string; app_user_id?: string; product_id?: string; new_product_id?: string; cancel_reason?: string; transferred_from?: string[]; transferred_to?: string[] };
    records: Record<string, Record<string, Ent>>;
    expect: Record<string, { tier: string | null; source: string | null; founding?: boolean } | number>;
  };
  const { scenarios } = JSON.parse(readFileSync(join(HERE, 'payments.json'), 'utf8')) as {
    scenarios: { name: string; members: string[]; manual?: Record<string, string>; steps: Step[] }[];
  };
  const steps = scenarios.flatMap((s) => s.steps.map((step) => ({ s, step })));

  it('sends every kind of store event the plan names: a purchase, a renewal, a cancellation, an expiry, a billing issue, a change of product, a transfer and a refund', () => {
    const kinds = new Set(steps.map(({ step }) => (step.event?.cancel_reason === 'CUSTOMER_SUPPORT' ? 'REFUND' : step.event?.type)));
    for (const kind of ['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'PRODUCT_CHANGE', 'TRANSFER', 'REFUND']) {
      expect([kind, kinds.has(kind)]).toEqual([kind, true]);
    }
    expect(steps.some(({ step }) => step.via === 'app')).toBe(true);
  });

  it('buys every product the app sells', () => {
    const sold = /store products are ([^;]+?); their prices/s.exec(readFileSync(join(__dirname, '..', '..', 'src', 'lib', 'revenueCat.ts'), 'utf8'))?.[1] ?? '';
    const products = [...sold.matchAll(/`([a-z_]+)`/g)].map((m) => m[1] ?? '');
    expect(products).toHaveLength(5);
    const bought = new Set(steps.flatMap(({ step }) => Object.values(step.records).flatMap((r) => Object.values(r).map((e) => e.product))));
    for (const p of products) expect([p, bought.has(p)]).toEqual([p, true]);
  });

  it('expects ranks that change within each scenario, so a webhook that read the event and not the record would fail', () => {
    for (const s of scenarios) {
      const tiers = new Set(s.steps.flatMap((step) => Object.entries(step.expect).filter(([k]) => k !== 'seats').map(([, v]) => (v as { tier: string | null }).tier)));
      const lifetime = s.steps.some((step) => Object.values(step.records).some((r) => Object.values(r).some((e) => e.ends === null)));
      expect([s.name, tiers.size > 1 || !!s.manual || lifetime]).toEqual([s.name, true]);
    }
  });

  it('gives each step a record for every member, and expects every member\'s rank after it', () => {
    for (const { s, step } of steps) {
      expect([s.name, Object.keys(step.records).sort()]).toEqual([s.name, [...s.members].sort()]);
      expect([s.name, Object.keys(step.expect).filter((k) => k !== 'seats').sort()]).toEqual([s.name, [...s.members].sort()]);
      const named = step.via === 'app' ? [step.as] : [step.event?.app_user_id, ...(step.event?.transferred_from ?? []), ...(step.event?.transferred_to ?? [])];
      for (const m of named.filter(Boolean)) expect([s.name, s.members.includes(m ?? '')]).toEqual([s.name, true]);
    }
  });
});

describe("the House's emails (P0.80)", () => {
  it('sends as production does: an address confirmed first, production\'s hourly allowance, each template with its subject', () => {
    expect(placed.mailed).toMatch(/^enable_confirmations = true$/m);
    expect(placed.mailed).not.toMatch(/^enable_confirmations = false$/m);
    expect(placed.mailed).toContain('[auth.rate_limit]\nemail_sent = 300\n');
    for (const [name, t] of Object.entries(placed.mail)) {
      expect(placed.mailed).toContain(`[auth.email.template.${name}]\nsubject = ${JSON.stringify(t.subject)}\ncontent_path = "./supabase/templates/${t.file}"\n`);
    }
    expect(placed.mailRefused).toMatch(/rate_limit/);
    expect(placed.rewritten.indexOf('[auth.email.template.')).toBeLessThan(placed.rewritten.indexOf('[functions.'));
  });

  it('the code the app asks for is in its letter, and nothing that signs anyone in', () => {
    expect(Object.keys(placed.mail)).toEqual(['magic_link']);
    const letter = readFileSync(join(ROOT, 'supabase', 'email_templates', placed.mail.magic_link?.file ?? ''), 'utf8');
    expect(letter).toContain('{{ .Token }}');
    expect(letter).not.toMatch(/ConfirmationURL|TokenHash|RedirectTo/);
    const settings = readFileSync(join(__dirname, '..', '..', 'src', 'features', 'settings', 'SettingsScreen.tsx'), 'utf8');
    expect(settings).toContain('supabase.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } })');
    expect(settings).toContain("supabase.auth.verifyOtp({ email: user.email, token: otpCode, type: 'email' })");
  });

  it('asks for each email the app sends, and uses it', () => {
    const mail = readFileSync(join(HERE, 'mail.mjs'), 'utf8');
    for (const asked of ["auth('/signup'", "auth('/recover'", "auth('/otp'", "auth('/verify'"]) expect([asked, mail.includes(asked)]).toEqual([asked, true]);
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
      'bash mobile/e2e/functions/seal-vendors.sh',
      'bash mobile/e2e/db/seal.sh',
      'node mobile/e2e/db/bootstrap.mjs',
      'node mobile/e2e/db/up-down-up.mjs',
      'node mobile/e2e/functions/suites.mjs',
      'node mobile/e2e/functions/payments.mjs',
      'node mobile/e2e/functions/mail.mjs',
    ].map((step) => [step, job.indexOf(step)] as const);
    for (const [step, at] of order) expect([step, at > 0]).toEqual([step, true]);
    expect(order.map(([, at]) => at)).toEqual([...order.map(([, at]) => at)].sort((a, b) => a - b));
  });

  it('serves the edge runtime: the stack leaves out only what no function needs', () => {
    const start = (/bash mobile\/e2e\/start-stack\.sh ([^ ]+) /.exec(job)?.[1] ?? '').split(',').filter(Boolean);
    expect(start.length).toBeGreaterThan(0);
    for (const needed of ['edge-runtime', 'kong', 'gotrue', 'postgrest', 'mailpit']) expect([needed, start.includes(needed)]).toEqual([needed, false]);
  });
});
