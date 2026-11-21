#!/usr/bin/env node
/**
 * inventory.cjs — every screen the app can show: route × state × size × platform × mode, each cell
 * with its picture and its finish score, and a check that refuses a blank one.
 *
 *   node mockups/tools/inventory.cjs                       the inventory from the code, as counts
 *   node mockups/tools/inventory.cjs --json FILE           every cell, with its result, as data
 *   node mockups/tools/inventory.cjs --md FILE             route × state, filled of all, as a table
 *   node mockups/tools/inventory.cjs --check [--results F] exits 1 naming every blank cell
 *
 * Built from the code each run, so a new route or a state drawn for the first time adds its cells
 * at once:
 *   route     every route file in app/ (test-utils/universe.js `routes`), layouts left out
 *   state     `shown` (its content in) for every route, and each state the route's own code draws
 *             (STATES): read from the route file and the files it imports, and theirs in the same
 *             folder; a shared part counts where it is imported (a screen that imports TryAgain
 *             draws a failed read)
 *   size      every window in mockups/devices.json
 *   platform  android, ios
 *   mode      normal, largest (the platform's largest text: iOS 3.1, Android 2), arabic (the
 *             member's words in Arabic, read right to left)
 * A cell's result (the results file, mockups/audit by default) is { picture, rubric } — the path
 * of its picture, which must exist, and its score on the finish rubric (kept with the audit's private records)
 * — or { moved } naming the steps that carry it to the owner's own phone check, where the iPhone
 * table says the checks cannot reach. Anything less is blank. The check is red until stage D fills
 * every cell.
 */
const fs = require('fs');
const path = require('path');
const { MOBILE, routeSources, parse, importsOf, localImports } = require('./source.cjs');
const { stripComments } = require('../../test-utils/stripComments');

const DEVICES = JSON.parse(fs.readFileSync(path.join(MOBILE, 'mockups', 'devices.json'), 'utf8'));
const RESULTS = path.join(MOBILE, 'audit', 'final', 'screen-results.json');
const PLATFORMS = ['android', 'ios'];
const MODES = ['normal', 'largest', 'arabic'];

/** Each state a screen can draw, and what in its code says it draws it. */
const STATES = {
  loading: /\buseScreenReady\b|\bisLoading\b|\bisPending\b|Skeleton\b|\bActivityIndicator\b|\bPreloader\b|'reading'/,
  empty: /\bEmpty[A-Z]\w*|\bNotInTheArchive\b|\bisEmpty\b/,
  failed: /\bTryAgain\b|\bEmptyOffline\b|\bSearchUnreachable\b|\bREFRESH_FAILED\b|\bisError\b|'failed'/,
  offline: /\buseOfflineAware\b|\bOfflineBanner\b|\bonlineManager\b/,
  'signed out': /\baskIn\b|\bMembersOnly\b|\bsignInReturn\b|\bguest\b/,
  gated: /\buseClearance\b|\bClearance\b|\bVelvetRope\b/,
  blocked: /\buseBanCheck\b|\bStandingNotice\b|\bisBlocked\b|\bblockedIds\b/,
  keyboard: /<TextInput\b|\bControlledInput\b|\buseKeyboardLift\b|\buseModalKeyboardPadding\b/,
};

/** A route's name in a picture's path: `film-id`, `tabs-darkroom`. */
const slug = (rel) => rel.replace(/^app\//, '').replace(/\.tsx?$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The files whose code says what a route draws: itself, what it imports, and theirs in the same folder. */
function codeOf(route, read = (f) => parse(f)) {
  const files = new Map([[route.abs, route]]);
  for (const one of localImports(route)) {
    if (files.has(one) || /[\\/]app[\\/]/.test(path.relative(MOBILE, one))) continue;
    const s = read(one);
    files.set(one, s);
    for (const two of localImports(s)) if (!files.has(two) && path.dirname(two) === path.dirname(one)) files.set(two, read(two));
  }
  return [...files.values()];
}

/** The states one route draws, each with the files that say so. */
function statesOf(route, read) {
  const found = {};
  for (const src of codeOf(route, read)) {
    const code = stripComments(src.text, src.abs);
    const imported = Object.keys(importsOf(src));
    for (const [state, re] of Object.entries(STATES)) {
      if (re.test(code) || imported.some((n) => re.test(n))) (found[state] = found[state] ?? []).push(src.rel);
    }
  }
  // In one order, STATES', so the inventory reads the same run to run.
  return { shown: [route.rel], ...Object.fromEntries(Object.keys(STATES).filter((s) => found[s]).map((s) => [s, found[s]])) };
}

/** Every cell: { id, route, state, size, platform, mode, picture } with its picture's expected path. */
function cellsOf(routes, widths = Object.keys(DEVICES.heightAt).map(Number)) {
  const cells = [];
  for (const r of routes) {
    for (const state of Object.keys(r.states)) for (const size of widths) for (const platform of PLATFORMS) for (const mode of MODES) {
      cells.push({ id: `${r.route}|${state}|${size}|${platform}|${mode}`, route: r.route, state, size, platform, mode,
        picture: `mockups/out/inventory/${platform}/${mode}/${size}/${slug(r.route)}--${state.replace(/ /g, '-')}.png` });
    }
  }
  return cells;
}

/** The inventory from the code: each route with its states. */
function inventory(sources = routeSources()) {
  return sources.filter((s) => !/\/_layout\.tsx$/.test(s.rel)).map((s) => ({ route: s.rel, states: statesOf(s) }));
}

/** Why a cell is blank, or null when it is filled. */
function blankWhy(cell, result, exists = (p) => fs.existsSync(path.join(MOBILE, p))) {
  if (!result) return 'no result';
  if (typeof result.moved === 'string' && result.moved.trim().length >= 20) return null;
  if (!result.picture) return 'no picture';
  if (!exists(result.picture)) return `its picture ${result.picture} is not there`;
  if (!result.rubric || typeof result.rubric.passed !== 'boolean') return 'no finish score';
  return null;
}

/** Every blank cell, and how many were filled. */
function check(cells, results) {
  const blank = [];
  for (const c of cells) {
    const why = blankWhy(c, results.cells?.[c.id]);
    if (why) blank.push({ id: c.id, why });
  }
  return { blank, filled: cells.length - blank.length };
}

function table(routes, cells, results) {
  const lines = ['| Route | State | Filled | Of |', '|---|---|---|---|'];
  for (const r of routes) for (const state of Object.keys(r.states)) {
    const mine = cells.filter((c) => c.route === r.route && c.state === state);
    const filled = mine.filter((c) => !blankWhy(c, results.cells?.[c.id])).length;
    lines.push(`| ${r.route} | ${state} | ${filled} | ${mine.length} |`);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const routes = inventory();
  const cells = cellsOf(routes);
  const file = opt('--results', RESULTS);
  const results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { cells: {} };
  const { blank, filled } = check(cells, results);
  const states = routes.reduce((n, r) => n + Object.keys(r.states).length, 0);
  console.log(`${routes.length} routes, ${states} route states, ${Object.keys(DEVICES.heightAt).length} sizes × ${PLATFORMS.length} platforms × ${MODES.length} modes: ${cells.length} cells, ${filled} filled, ${blank.length} blank`);
  if (opt('--json', null)) fs.writeFileSync(opt('--json'), `${JSON.stringify({ routes, cells: cells.map((c) => ({ ...c, result: results.cells?.[c.id] ?? null })) }, null, 2)}\n`);
  if (opt('--md', null)) fs.writeFileSync(opt('--md'), table(routes, cells, results));
  if (argv.includes('--check') && blank.length) {
    const by = new Map();
    for (const b of blank) { const k = b.id.split('|').slice(0, 2).join(' · '); by.set(k, (by.get(k) ?? 0) + 1); }
    console.error(`Blank cells (${blank.length}), by route and state:\n  ${[...by].map(([k, n]) => `${k}: ${n}`).join('\n  ')}`);
    console.error(`first: ${blank.slice(0, 5).map((b) => `${b.id} (${b.why})`).join('; ')}`);
    return 1;
  }
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { STATES, PLATFORMS, MODES, slug, statesOf, cellsOf, inventory, blankWhy, check };
