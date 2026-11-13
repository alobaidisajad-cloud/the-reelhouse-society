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
 * Exits 1 on any stage that fails.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function main(dir) {
  let ok = true;
  const out = [];
  for (const stage of STAGES) {
    const file = join(dir, `${stage.name}.json`);
    let tree = null;
    try { tree = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { tree = null; }
    const v = judgeStage(stage, tree);
    if (!v.ok) ok = false;
    out.push(v.line);
  }
  console.log([`the iPad, upright and on its side: ${ok ? 'every stage in place' : 'A STAGE FAILED'}`, ...out.map((l) => `  ${l}`)].join('\n'));
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { process.exit(main(process.argv[2] ?? '.') ? 0 : 1); } catch (e) { console.error(`ios-ipad-judge: ${e.message}`); process.exit(1); }
}
