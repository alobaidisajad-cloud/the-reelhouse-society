#!/usr/bin/env node
/**
 * ios-ipad-judge.mjs — the app on an iPad simulator, upright and on its side (WORKLIST P4.33).
 *
 *   node e2e/ios-ipad-judge.mjs <dir>     (dir holds each stage's <stage>.json, a `maestro hierarchy`)
 *
 * The stages, in the order ios-launch.yml takes them: the Lobby upright, the sign-in sheet upright,
 * the sheet with the iPad turned on its side, the Lobby on its side. Each is judged:
 *   - read at all (a stage with no tree was never reached);
 *   - the iPad's own window: at least IPAD_SHORTEST points on its short side (an iPhone app shown in
 *     a box on the iPad would report an iPhone's window);
 *   - held the way the stage says (upright taller than wide, on its side wider than tall: a turn
 *     the app refused leaves the window upright);
 *   - its control found (the Lobby's tab, the sheet's press), and inside the window.
 * Each control's box is printed, so the photographs (<stage>.png) are read with their numbers.
 * And the welcome's projector beam, read from the upright Lobby's photograph down its heart, from
 * under the welcome's rule to above its button, and across the page at three heights, from the
 * margin on one side to the margin on the other: no colour held over BEAM_RUN_MAX pixels where the
 * light moves (a band), no step over BEAM_STEP_MAX levels between neighbouring stretches (an edge).
 * Exits 1 on any stage, or a beam, that fails. Its photographs are read by png.mjs, Node's own
 * zlib: the iPad's job installs no packages.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { boxes } from './ios-sign-in-judge.mjs';
import { decodePng } from './png.mjs';

/** The narrowest iPad's short side in points (iPad mini, 744): the drawings' narrowest iPad. */
export const IPAD_SHORTEST = 744;

/** Each stage: the control it must hold, and how the iPad is held. */
export const STAGES = [
  { name: 'upright-lobby', control: 'home-tab', side: false },
  { name: 'upright-sign-in', control: 'sign-in-submit', side: false },
  { name: 'side-sign-in', control: 'sign-in-submit', side: true },
  { name: 'side-lobby', control: 'home-tab', side: true },
];

/** One stage's verdict from its tree (null when there was none): whether it passes, and its line. */
export function judgeStage(stage, tree) {
  if (!tree) return { ok: false, line: `${stage.name}: NO TREE (the stage was never reached)` };
  const { found, screen } = boxes(tree, [stage.control]);
  if (!screen) return { ok: false, line: `${stage.name}: NO WINDOW in the tree` };
  const faults = [];
  const short = Math.min(screen.width, screen.height);
  if (short < IPAD_SHORTEST) faults.push(`a window of ${screen.width}x${screen.height}pt is no iPad's (short side under ${IPAD_SHORTEST})`);
  const wide = screen.width > screen.height;
  if (wide !== stage.side) faults.push(stage.side ? 'still upright: the app did not turn' : 'on its side when it should stand upright');
  const box = found[stage.control];
  if (!box) faults.push(`${stage.control} not found`);
  else if (box.left < 0 || box.top < 0 || box.right > screen.width || box.bottom > screen.height) faults.push(`${stage.control} outside the window`);
  const at = box ? ` ${stage.control} at ${box.left},${box.top}..${box.right},${box.bottom}` : '';
  return {
    ok: faults.length === 0,
    line: `${stage.name}: ${faults.length ? `FAILED (${faults.join('; ')})` : 'in place'}, window ${screen.width}x${screen.height}pt;${at}`,
  };
}

/** The page's column on a wide window, in points: navMetrics' READING_MAX (iosIpadJudge.test.ts holds them equal). */
export const PAGE_COLUMN = 560;
/** The longest run of one colour a smooth light shows where it moves, in pixels (the halo's). */
export const BEAM_RUN_MAX = 4;
/** The largest step, in levels, between two neighbouring 8-pixel stretches of a smooth light. */
export const BEAM_STEP_MAX = 1.5;
/**
 * Where the beam is read, as shares of the upright window: across the page at three heights below
 * the welcome's words, and down its heart from under the rule (0.37) to above the button (0.84).
 * The heart was once read from 0.52 alone, and the light cut at the window's middle passed.
 */
export const BEAM_ACROSS_AT = [0.5, 0.65, 0.8];
export const BEAM_DOWN = [0.39, 0.83];
/** How far into the margin beside the page a line across is read, in points: an edge at the page's side is a step there. */
export const BEAM_MARGIN = 24;

/**
 * A line of the photograph, read as light: the longest run of one colour, the longest where the
 * light moves across it (a band: dither leaves one colour where the light rests on a level, and the
 * eye sees no step there), the levels counted, and the largest step between neighbouring 8-pixel
 * stretches (an edge; dither's noise averages away).
 */
export function lightAlong(pixelAt, points) {
  const keys = [];
  const level = [];
  for (const [x, y] of points) {
    const c = pixelAt(x, y);
    keys.push(c.join(','));
    level.push((c[0] + c[1] + c[2]) / 3);
  }
  const mean = (a, b) => {
    const from = Math.max(0, a), to = Math.min(level.length, b);
    return to > from ? level.slice(from, to).reduce((s, v) => s + v, 0) / (to - from) : NaN;
  };
  // A band is a stair: the 8 pixels before it all on one side of its level, the 8 after all on the
  // other. Dither never leaves one: around a run of one colour its neighbours fall on both sides.
  const side = (a, b, v) => {
    const s = level.slice(Math.max(0, a), Math.min(level.length, b));
    if (s.length < 8) return 0;
    return s.every((x) => x < v) ? -1 : s.every((x) => x > v) ? 1 : 0;
  };
  let longest = 0, banded = 0;
  for (let start = 0, i = 1; i <= keys.length; i++) {
    if (i < keys.length && keys[i] === keys[start]) continue;
    const run = i - start;
    longest = Math.max(longest, run);
    const before = side(start - 8, start, level[start]);
    const after = side(i, i + 8, level[start]);
    if (before !== 0 && after === -before) banded = Math.max(banded, run);
    start = i;
  }
  let step = 0;
  for (let i = 0; i + 16 <= level.length; i += 1) step = Math.max(step, Math.abs(mean(i, i + 8) - mean(i + 8, i + 16)));
  return { longest, banded, levels: new Set(keys).size, step: +step.toFixed(2) };
}

/**
 * The welcome's projector beam, upright: drawn on the iPad as a shaft inside the page, its light
 * must fall away with no band and no edge, across the page and down its heart (ProjectorBeam).
 */
export function judgeBeam(tree, png) {
  const { screen } = boxes(tree, []);
  if (!screen || !png) return { ok: false, line: 'the beam: NOT READ (no window, or no photograph)' };
  const scale = png.width / screen.width;
  const at = (x, y) => { const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const column = Math.min(screen.width, PAGE_COLUMN);
  const line = (from, to, y) => Array.from({ length: to - from }, (_, i) => [from + i, y]);
  const inside = (x) => Math.min(png.width - 1, Math.max(0, x));
  // An edge is looked for across the whole page and into the margin each side (a light that meets
  // the page's side stops there in a line); a band only in the beam's lit middle half, where light
  // falls: the bare ground beyond it holds one colour by nature.
  const rows = BEAM_ACROSS_AT.map((f) => {
    const y = Math.round(screen.height * f * scale);
    const across = line(inside(Math.round(((screen.width - column) / 2 - BEAM_MARGIN) * scale)), inside(Math.round(((screen.width + column) / 2 + BEAM_MARGIN) * scale)), y);
    const heart = line(Math.round(((screen.width - column / 2) / 2) * scale), Math.round(((screen.width + column / 2) / 2) * scale), y);
    return { ...lightAlong(at, heart), step: lightAlong(at, across).step };
  });
  const middle = Math.round((screen.width / 2) * scale);
  const [top, bottom] = BEAM_DOWN.map((f) => Math.round(screen.height * f * scale));
  const down = Array.from({ length: bottom - top }, (_, i) => [middle, top + i]);
  const a = {
    levels: Math.min(...rows.map((r) => r.levels)),
    longest: Math.max(...rows.map((r) => r.longest)),
    banded: Math.max(...rows.map((r) => r.banded)),
    step: Math.max(...rows.map((r) => r.step)),
  };
  const d = lightAlong(at, down);
  const faults = [];
  for (const [name, r] of [['across the page', a], ['down its heart', d]]) {
    if (r.levels < 2) faults.push(`${name}: one colour, no light read`);
    if (r.banded > BEAM_RUN_MAX) faults.push(`${name}: BANDED, one colour for ${r.banded} px where the light moves`);
    if (r.step > BEAM_STEP_MAX) faults.push(`${name}: AN EDGE, a step of ${r.step} levels`);
  }
  const said = `across ${a.levels} colours, longest band ${a.banded} px (run ${a.longest}), largest step ${a.step}; down ${d.levels} colours, longest band ${d.banded} px (run ${d.longest}), largest step ${d.step} (at most ${BEAM_RUN_MAX} px and ${BEAM_STEP_MAX})`;
  return { ok: faults.length === 0, line: `the beam: ${faults.length ? `FAILED (${faults.join('; ')})` : 'smooth, no band and no edge'}, ${said}` };
}

function main(dir) {
  let ok = true;
  const out = [];
  const trees = {};
  for (const stage of STAGES) {
    const file = join(dir, `${stage.name}.json`);
    let tree = null;
    try { tree = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { tree = null; }
    trees[stage.name] = tree;
    const v = judgeStage(stage, tree);
    if (!v.ok) ok = false;
    out.push(v.line);
  }
  // The beam, read from the upright welcome's photograph.
  const shot = join(dir, 'upright-lobby.png');
  const photo = existsSync(shot) ? decodePng(readFileSync(shot)) : null;
  const beam = judgeBeam(trees['upright-lobby'], photo && { width: photo.width, height: photo.height, data: photo.pixels });
  if (!beam.ok) ok = false;
  out.push(beam.line);
  console.log([`the iPad, upright and on its side: ${ok ? 'every stage in place' : 'A STAGE FAILED'}`, ...out.map((l) => `  ${l}`)].join('\n'));
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { process.exit(main(process.argv[2] ?? '.') ? 0 : 1); } catch (e) { console.error(`ios-ipad-judge: ${e.message}`); process.exit(1); }
}
