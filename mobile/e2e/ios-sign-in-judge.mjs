#!/usr/bin/env node
/**
 * ios-sign-in-judge.mjs — the sign-in sheet on the iPhone simulator, in English and in Arabic.
 *
 *   node e2e/ios-sign-in-judge.mjs <dir>     (dir holds en.json, ar.json, en.png, ar-languages.txt)
 *
 * LEFT TO RIGHT (WORKLIST P4.27, judged): the system set to Arabic must move no control. Each of
 * the sheet's controls stands where it stood in English, to the point (a layout React Native had
 * turned right to left would mirror them). The Arabic run counts only if the simulator said its
 * language was Arabic (ar-languages.txt, `defaults read -g AppleLanguages`). Exits 1 on either.
 *
 * THE HALO'S LIGHT (judged): a column of pixels from the seal's top edge upward through the
 * candlelight halo, read from the English photograph, stopping at the foot of the sheet's header
 * (the full-width box that holds the close button): the longest run of one colour inside the glow.
 * Android's glow is dithered (no run over 2 px, run 43125165954); so is iOS's, read this way (2 px,
 * ios-launch 43517908839). The first reading ran 60pt up into the header's flat grey and took its
 * runs (up to 40 px) for rings. A run over HALO_RUN_MAX fails: rings a member may see on the dark.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const RECT = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/;
/** The sheet's controls, by the ids the app sets. */
export const CONTROLS = ['email-input', 'password-input', 'sign-in-submit'];
/** The seal the halo lights, by its spoken label (SocietySeal). */
export const SEAL = 'The ReelHouse Society seal';
/** The sheet's close button, by its label: its full-width box is the header the halo stops at. */
export const CLOSE = 'Close login';
/** The longest run of one colour a smooth glow shows on a phone's photograph, in pixels. */
export const HALO_RUN_MAX = 4;
/** The shortest column, in pixels, that holds enough of the glow to judge (the iPhone's: 44). */
export const HALO_SPAN_MIN = 12;

/** The foot of the sheet's header: the nearest full-width box holding the close button, or null. */
export function headerFoot(tree) {
  let screen = null;
  let foot = null;
  const walk = (node, chain) => {
    if (!node || typeof node !== 'object' || foot !== null) return;
    const a = node.attributes ?? {};
    const r = RECT.exec(a.bounds || '');
    const box = r ? { left: +r[1], top: +r[2], right: +r[3], bottom: +r[4] } : null;
    if (box && !screen && box.right > 0) screen = box;
    if (a.accessibilityText === CLOSE && screen) {
      const header = [...chain].reverse().find((b) => b && b.left === screen.left && b.right === screen.right);
      foot = header ? header.bottom : null;
      return;
    }
    for (const c of node.children ?? []) walk(c, [...chain, box]);
  };
  walk(tree, []);
  return foot;
}

/** Each id's box in a `maestro hierarchy`, and the screen's own (the root's bounds). */
export function boxes(tree, ids = CONTROLS) {
  const found = {};
  let screen = null;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    const r = RECT.exec(a.bounds || '');
    if (r && !screen && +r[3] > 0) screen = { width: +r[3] - +r[1], height: +r[4] - +r[2] };
    // By the id the app sets, or by what it says aloud (the seal has only its label).
    const id = [a['resource-id'], a.resourceId, a.identifier, a.accessibilityText].find((v) => v && ids.includes(v)) ?? '';
    if (id && r && !found[id]) found[id] = { left: +r[1], top: +r[2], right: +r[3], bottom: +r[4] };
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return { found, screen };
}

/** Whether Arabic's controls stand where English's do: one line each, and the verdict. */
export function sameSide(en, ar, ids = CONTROLS) {
  const lines = [];
  let ok = true;
  for (const id of ids) {
    const a = en[id], b = ar[id];
    if (!a || !b) { ok = false; lines.push(`${id}: not found ${!a ? 'in English' : 'in Arabic'}`); continue; }
    const moved = Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right), Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom));
    if (moved > 1) ok = false;
    lines.push(`${id}: ${moved > 1 ? `MOVED ${moved}pt` : 'in place'} (English ${a.left},${a.top}..${a.right},${a.bottom}; Arabic ${b.left},${b.top}..${b.right},${b.bottom})`);
  }
  return { ok, lines };
}

/**
 * The longest run of one colour in a column of the photograph, from `fromY` up for `span` pixels,
 * once the glow begins (the first change of colour): its length, and the colours counted.
 */
export function longestRun(pixelAt, x, fromY, span) {
  let run = 0, longest = 0, last = null, levels = 0;
  for (let y = fromY; y > Math.max(0, fromY - span); y--) {
    const c = pixelAt(x, y).join(',');
    if (c === last) { run++; } else { levels++; run = 1; last = c; }
    if (levels > 1) longest = Math.max(longest, run);
  }
  return { longest, levels };
}

async function main(dir) {
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const en = boxes(read('en.json'));
  const ar = boxes(read('ar.json'));
  const said = existsSync(join(dir, 'ar-languages.txt')) ? readFileSync(join(dir, 'ar-languages.txt'), 'utf8') : '';
  const out = [];
  let ok = true;
  if (!/\bar\b/.test(said)) { ok = false; out.push(`the simulator never said it was in Arabic (AppleLanguages: ${said.replace(/\s+/g, ' ').trim() || 'unread'})`); }
  const side = sameSide(en.found, ar.found);
  if (!side.ok) ok = false;
  out.push(`left to right, the system in Arabic: ${side.ok ? 'no control moved' : 'A CONTROL MOVED, or was not found'}`, ...side.lines.map((l) => `  ${l}`));
  // The halo: the seal's top edge, a column at its middle, up through the glow to the header's foot.
  const tree = read('en.json');
  const seal = boxes(tree, [SEAL]).found[SEAL];
  if (seal && existsSync(join(dir, 'en.png')) && en.screen) {
    const { PNG } = createRequire(import.meta.url)('pngjs');
    const png = PNG.sync.read(readFileSync(join(dir, 'en.png')));
    const scale = png.width / en.screen.width;
    const at = (x, y) => { const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    const x = Math.round(((seal.left + seal.right) / 2) * scale);
    const top = Math.round(seal.top * scale) - 2;
    const foot = headerFoot(tree);
    const span = foot === null ? Math.round(60 * scale) : top - Math.round(foot * scale) - 2;
    const r = longestRun(at, x, top, span);
    // A column too short to hold a glow, or one colour from end to end, measured nothing: a header
    // found too low (a box the screen's width that is not the header) would pass any halo.
    if (span < HALO_SPAN_MIN || r.levels < 2) {
      ok = false;
      out.push(`the halo: NOT READ, ${span} px above the seal${foot === null ? '' : ' to the header'} and ${r.levels} colours (at least ${HALO_SPAN_MIN} px and 2 colours)`);
    } else {
      const smooth = r.longest <= HALO_RUN_MAX;
      if (!smooth) ok = false;
      out.push(`the halo: ${smooth ? 'smooth' : 'BANDED'}, above the seal${foot === null ? '' : ' to the header'}, ${r.levels} colours over ${span} px, the longest run of one ${r.longest} px at ${scale}x (at most ${HALO_RUN_MAX})`);
    }
  } else {
    out.push('the halo (not judged): not read (no seal in the tree, or no photograph)');
  }
  console.log(out.join('\n'));
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv[2] ?? '.').then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(`ios-sign-in-judge: ${e.message}`); process.exit(1); });
}
