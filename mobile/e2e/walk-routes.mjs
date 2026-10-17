#!/usr/bin/env node
/**
 * walk-routes.mjs — the route walk (WORKLIST P0.86): every route in e2e/routes.json opened cold by
 * its deep link, as a guest or as the seeded member, and its screen captured.
 *
 *   node e2e/walk-routes.mjs <out dir>
 *
 * Each {placeholder} in a link is read back from the sealed world's database (API_URL and
 * SERVICE_ROLE_KEY, as the seed has them), by the names the seed gave its rows (e2e/db/seed.mjs,
 * with E2E_SEED_WALK), never written down: a row the seed did not make stops the walk, naming it.
 * Then a Maestro flow is written (<out dir>/walk.yaml): the guests' routes first from a cleared app,
 * then the member signed in once (.maestro/subflows/sign_in.yaml), and for every route the app
 * stopped, its link opened (a cold start), the screen let settle, and captured as <n>-<name>.png,
 * a name relative to Maestro's own output folder (Maestro refuses a capture outside it: run-flows.sh
 * names <out dir>/routes as that folder). <out dir>/walk.tsv lists each route, its link and its capture.
 * run-flows.sh runs the flow; app-crashes.mjs judges the device log, and route-judges.mjs that
 * every route was captured.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SCHEME = 'reelhouse://';

/** The film and the person the sealed world holds a recording of (e2e/supabase/functions/tmdb-proxy/fixtures). */
export const RECORDED = { film: '129', person: '608' };

/** A route's name in its capture's file: its route file, as a word. */
export const nameOf = (file) => file.replace(/^app\//, '').replace(/\.tsx$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Each placeholder's value, read from the database by the names the seed gave its rows. */
export async function readIds(ask) {
  const one = async (what, path, pick = (r) => r.id) => {
    const rows = await ask(path);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`the seed made no ${what} (${path})`);
    return String(pick(rows[0]));
  };
  const member = await one('member e2e_member', '/rest/v1/profiles?select=id&username=eq.e2e_member');
  const essay = await ask('/rest/v1/dispatch_posts?select=id,series_id&title=eq.E2E%20walk%20essay');
  if (!Array.isArray(essay) || !essay[0]?.series_id) throw new Error('the seed made no essay in a series (E2E_SEED_WALK)');
  return {
    member: 'e2e_member',
    filing: await one('take of the member', `/rest/v1/dispatch_posts?select=id&kind=eq.take&user_id=eq.${member}&limit=1`),
    stack: await one('stack', `/rest/v1/lists?select=id&user_id=eq.${member}&limit=1`),
    log: await one('log', `/rest/v1/logs?select=id&user_id=eq.${member}&film_id=eq.${RECORDED.film}&limit=1`),
    lounge: await one('open Lounge (E2E_SEED_WALK)', '/rest/v1/lounges?select=id&name=eq.E2E%20walk%20lounge'),
    dossier: String(essay[0].id),
    series: String(essay[0].series_id),
    ...RECORDED,
  };
}

/**
 * The id of the mark the E2E build draws for a path (routeMarkOf in
 * src/components/layout/E2ERouteMark.tsx, which walkRoutes.test.ts holds this to).
 */
export const markOf = (path) => {
  const words = path.split('?')[0].replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return words ? `e2e-route-${words}` : 'e2e-route';
};

/** Each route with its link filled in, guests first, in the list's order. */
export function plan(routes, ids) {
  const seen = new Set();
  const out = [];
  for (const [file, r] of Object.entries(routes)) {
    const fill = (text) => text.replace(/\{([a-z]+)\}/g, (_, k) => {
      if (!(k in ids)) throw new Error(`${file}: no id for {${k}}`);
      return encodeURIComponent(ids[k]);
    });
    const link = fill(r.link);
    if (seen.has(link)) continue;   // an alias that redirects: its link is opened once
    seen.add(link);
    // Where it lands: its own path, or the path its `lands` says it is sent on to.
    out.push({ file, link, lands: fill(r.lands ?? r.link).split('?')[0], as: r.as ?? 'member' });
  }
  return [...out.filter((r) => r.as === 'guest'), ...out.filter((r) => r.as !== 'guest')];
}

/** The Maestro flow that walks the plan, capturing each route by a name in Maestro's output folder. */
export function flowOf(steps, signIn) {
  const lines = ['appId: com.reelhouse.society', '---', '- launchApp:', '    clearState: true'];
  let signedIn = false;
  steps.forEach((s, i) => {
    // Signed in from the app's own start: a guest's last route (the login modal, say) covers the tabs it signs in through.
    if (s.as !== 'guest' && !signedIn) { lines.push('- stopApp', '- launchApp', `- runFlow: ${JSON.stringify(signIn)}`); signedIn = true; }
    lines.push(
      `# ${s.file}`,
      '- stopApp',
      `- openLink: ${JSON.stringify(SCHEME + s.link.replace(/^\//, ''))}`,
      // Its mark, drawn once the preloader has gone, says the app stands on where it lands.
      '- extendedWaitUntil:',
      '    visible:',
      `      id: ${JSON.stringify(markOf(s.lands ?? s.link))}`,
      '    timeout: 30000',
      '- waitForAnimationToEnd:',
      '    timeout: 8000',
      `- takeScreenshot: ${JSON.stringify(`${String(i + 1).padStart(2, '0')}-${nameOf(s.file)}`)}`,
    );
  });
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2];
  const API = process.env.API_URL;
  const KEY = process.env.SERVICE_ROLE_KEY;
  if (!out || !API || !KEY) {
    console.error('usage: node e2e/walk-routes.mjs <out dir>, with API_URL and SERVICE_ROLE_KEY of the sealed world');
    process.exit(2);
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
    console.error(`Refusing to walk ${API}: the walk reads only a local stack.`);
    process.exit(2);
  }
  const ask = async (path) => {
    const res = await fetch(`${API}${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  try {
    const { routes } = JSON.parse(readFileSync(join(HERE, 'routes.json'), 'utf8'));
    const steps = plan(routes, await readIds(ask));
    const shots = join(out, 'routes');
    mkdirSync(shots, { recursive: true });
    writeFileSync(join(out, 'walk.yaml'), flowOf(steps, join(HERE, '..', '.maestro', 'subflows', 'sign_in.yaml').split('\\').join('/')));
    writeFileSync(join(out, 'walk.tsv'), steps.map((s, i) => `${s.file}\t${s.link}\t${String(i + 1).padStart(2, '0')}-${nameOf(s.file)}.png`).join('\n') + '\n');
    console.log(`the walk: ${steps.length} routes (${steps.filter((s) => s.as === 'guest').length} as a guest), written to ${out}`);
  } catch (e) {
    console.error(`the walk cannot be planned: ${e.message}`);
    process.exit(1);
  }
}
