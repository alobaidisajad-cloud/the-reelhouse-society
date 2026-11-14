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
 * And the welcome's projector beam, read from the upright Lobby's photograph across the page and
 * down its heart: no colour held over BEAM_RUN_MAX pixels (a band), no step over BEAM_STEP_MAX
 * levels between neighbouring stretches (an edge). Exits 1 on any stage, or a beam, that fails.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { boxes } from './ios-sign-in-judge.mjs';

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

/** The longest run of one colour a smooth light shows on the photograph, in pixels (the halo's). */
export const BEAM_RUN_MAX = 4;
/** The largest step, in levels, between two neighbouring 8-pixel stretches of a smooth light. */
export const BEAM_STEP_MAX = 1.5;
/** Where the beam is read, as shares of the upright window: across the page at its middle, and down its heart. */
export const BEAM_ACROSS_AT = 0.6;
export const BEAM_DOWN = [0.52, 0.84];

/**
 * A line of the photograph, read as light: the longest run of one colour, the levels counted, and
 * the largest step between neighbouring 8-pixel stretches (an edge; dither's noise averages away).
 */
export function lightAlong(pixelAt, points) {
  let run = 0, longest = 0, last = null;
  const seen = new Set();
  const level = [];
  for (const [x, y] of points) {
    const c = pixelAt(x, y);
    const key = c.join(',');
    seen.add(key);
    run = key === last ? run + 1 : 1;
    last = key;
    longest = Math.max(longest, run);
    level.push((c[0] + c[1] + c[2]) / 3);
  }
  let step = 0;
  for (let i = 0; i + 16 <= level.length; i += 1) {
    const mean = (a, b) => level.slice(a, b).reduce((s, v) => s + v, 0) / (b - a);
    step = Math.max(step, Math.abs(mean(i, i + 8) - mean(i + 8, i + 16)));
  }
  return { longest, levels: seen.size, step: +step.toFixed(2) };
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
  const column = Math.min(screen.width, 560);
  const left = Math.round(((screen.width - column) / 2 + 8) * scale);
  const right = Math.round(((screen.width + column) / 2 - 8) * scale);
  const middle = Math.round((screen.width / 2) * scale);
  const across = Array.from({ length: right - left }, (_, i) => [left + i, Math.round(screen.height * BEAM_ACROSS_AT * scale)]);
  const [top, bottom] = BEAM_DOWN.map((f) => Math.round(screen.height * f * scale));
  const down = Array.from({ length: bottom - top }, (_, i) => [middle, top + i]);
  const a = lightAlong(at, across);
  const d = lightAlong(at, down);
  const faults = [];
  for (const [name, r] of [['across the page', a], ['down its heart', d]]) {
    if (r.levels < 2) faults.push(`${name}: one colour, no light read`);
    if (r.longest > BEAM_RUN_MAX) faults.push(`${name}: BANDED, one colour for ${r.longest} px`);
    if (r.step > BEAM_STEP_MAX) faults.push(`${name}: AN EDGE, a step of ${r.step} levels`);
  }
  const said = `across ${a.levels} colours, longest run ${a.longest} px, largest step ${a.step}; down ${d.levels} colours, longest run ${d.longest} px, largest step ${d.step} (at most ${BEAM_RUN_MAX} px and ${BEAM_STEP_MAX})`;
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
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const beam = judgeBeam(trees['upright-lobby'], existsSync(shot) ? PNG.sync.read(readFileSync(shot)) : null);
  if (!beam.ok) ok = false;
  out.push(beam.line);
  console.log([`the iPad, upright and on its side: ${ok ? 'every stage in place' : 'A STAGE FAILED'}`, ...out.map((l) => `  ${l}`)].join('\n'));
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { process.exit(main(process.argv[2] ?? '.') ? 0 : 1); } catch (e) { console.error(`ios-ipad-judge: ${e.message}`); process.exit(1); }
}
