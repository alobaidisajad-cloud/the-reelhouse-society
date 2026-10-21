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
 * names <out dir>/routes as that folder). Then each of the list's moments the same way, past its
 * taps. <out dir>/walk.tsv lists each route and moment, its link and its capture, and for a moment
 * the system draws part of (the keyboard), the part that is the app's.
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

/** A link with each {placeholder} filled in, or an error naming whose link asked for an id the seed did not make. */
const fillIn = (whose, text, ids) => text.replace(/\{([a-z]+)\}/g, (_, k) => {
  if (!(k in ids)) throw new Error(`${whose}: no id for {${k}}`);
  return encodeURIComponent(ids[k]);
});

/**
 * Each route with its link filled in, guests first, in the list's order; then each moment, as the
 * member: a screen past its link, reached by its taps in order (a system alert, the keyboard, the
 * calendar), captured as `moment: <its name>`.
 */
export function plan(routes, ids, moments = {}) {
  const seen = new Set();
  const out = [];
  for (const [file, r] of Object.entries(routes)) {
    const fill = (text) => fillIn(file, text, ids);
    const link = fill(r.link);
    if (seen.has(link)) continue;   // an alias that redirects: its link is opened once
    seen.add(link);
    // Where it lands: its own path, or the path its `lands` says it is sent on to.
    // `then`: the control a member taps from where the link leaves them, to reach the route (the Lobby: lastTab.ts).
    out.push({ file, link, lands: fill(r.lands ?? r.link).split('?')[0], as: r.as ?? 'member', ...(r.then ? { then: r.then } : {}) });
  }
  const shown = Object.entries(moments).map(([name, m]) => {
    const link = fillIn(`moment: ${name}`, m.link, ids);
    // `part`: what of the screen is the app's to draw, when the system draws the rest (the keyboard).
    // `keyboard`: the phone's keyboard on for this moment alone (the flows run with none).
    return { file: `moment: ${name}`, link, lands: link.split('?')[0], as: 'member', taps: m.taps, ...(m.shows ? { shows: m.shows } : {}), ...(m.part ? { part: m.part } : {}), ...(m.keyboard ? { keyboard: true } : {}) };
  });
  return [...out.filter((r) => r.as === 'guest'), ...out.filter((r) => r.as !== 'guest'), ...shown];
}

/** A control's selector in a flow, `indent` spaces in: its id, or the words it shows or is labelled. */
const pick = (t, indent) => `${' '.repeat(indent)}${t.id !== undefined ? 'id' : 'text'}: ${JSON.stringify(t.id ?? t.text)}`;

/** The Maestro flow that walks the plan, capturing each route by a name in Maestro's output folder. */
export function flowOf(steps, signIn) {
  const lines = ['appId: com.reelhouse.society', '---', '- launchApp:', '    clearState: true'];
  // The keyboard on or off through the proxy's phone controls (subflows/phone.yaml, beside sign_in.yaml).
  const keyboard = (on) => ['- runFlow:', `    file: ${JSON.stringify(signIn.replace(/sign_in\.yaml$/, 'phone.yaml'))}`, '    env:', '      SET: keyboard', `      TO: "${on}"`];
  let signedIn = false;
  steps.forEach((s, i) => {
    // Signed in from the app's own start: a guest's last route (the login modal, say) covers the tabs it signs in through.
    if (s.as !== 'guest' && !signedIn) { lines.push('- stopApp', '- launchApp', `- runFlow: ${JSON.stringify(signIn)}`); signedIn = true; }
    lines.push(
      `# ${s.file}`,
      ...(s.keyboard ? keyboard(true) : []),
      '- stopApp',
      `- openLink: ${JSON.stringify(SCHEME + s.link.replace(/^\//, ''))}`,
      // A tap after the link waits for any route's mark first (Maestro reads an id as a pattern): the
      // app has settled where it sent the member, past the curtain the tab it reopens is chosen behind.
      ...(s.then ? ['- extendedWaitUntil:', '    visible:', '      id: "e2e-route(-.+)?"', '    timeout: 30000', '- tapOn:', `    id: ${JSON.stringify(s.then)}`] : []),
      // Its mark, drawn once the preloader has gone, says the app stands on where it lands.
      '- extendedWaitUntil:',
      '    visible:',
      `      id: ${JSON.stringify(markOf(s.lands ?? s.link))}`,
      '    timeout: 30000',
      // A moment's taps, each control scrolled to when it is below and tapped once (a second tap
      // would close what the first opened); then what shows once the moment is there.
      ...(s.taps ?? []).flatMap((t) => [
        '- scrollUntilVisible:', '    element:', pick(t, 6), '    direction: DOWN', '    timeout: 20000',
        '- tapOn:', pick(t, 4), '    retryTapIfNoChange: false',
      ]),
      ...(s.shows ? ['- extendedWaitUntil:', '    visible:', pick(s.shows, 6), '    timeout: 15000'] : []),
      '- waitForAnimationToEnd:',
      '    timeout: 8000',
      `- takeScreenshot: ${JSON.stringify(`${String(i + 1).padStart(2, '0')}-${nameOf(s.file)}`)}`,
      ...(s.keyboard ? keyboard(false) : []),
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
    const { routes, moments } = JSON.parse(readFileSync(join(HERE, 'routes.json'), 'utf8'));
    const steps = plan(routes, await readIds(ask), moments);
    const shots = join(out, 'routes');
    mkdirSync(shots, { recursive: true });
    writeFileSync(join(out, 'walk.yaml'), flowOf(steps, join(HERE, '..', '.maestro', 'subflows', 'sign_in.yaml').split('\\').join('/')));
    writeFileSync(join(out, 'walk.tsv'), steps.map((s, i) => `${s.file}\t${s.link}\t${String(i + 1).padStart(2, '0')}-${nameOf(s.file)}.png${s.part ? `\t${s.part}` : ''}`).join('\n') + '\n');
    const shown = steps.filter((s) => s.taps).length;
    console.log(`the walk: ${steps.length - shown} routes (${steps.filter((s) => s.as === 'guest').length} as a guest) and ${shown} moments, written to ${out}`);
  } catch (e) {
    console.error(`the walk cannot be planned: ${e.message}`);
    process.exit(1);
  }
}
