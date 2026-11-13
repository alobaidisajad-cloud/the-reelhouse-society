#!/usr/bin/env node
/**
 * keyboard-room.mjs — is what the member needs above the keyboard, or under it?
 *
 *   node e2e/keyboard-room.mjs <name> <target> <hierarchy> <windows>
 *   node e2e/keyboard-room.mjs --top <windows>     exit 0 once the keyboard's window is there and drawn
 *   node e2e/keyboard-room.mjs --apart <name> <field> <press> <hierarchy> [dump.xml]
 *                                                  exit 0 when neither is drawn over the other
 *   node e2e/keyboard-room.mjs --panel <letters|emoji> <hierarchy> <windows>
 *                                                  exit 0 when the keyboard shows that panel (its height said)
 *
 * <target> is `#id` or `"text"`. The hierarchy is `maestro hierarchy`; the
 * windows are `adb shell dumpsys window windows`, read for the input method's
 * own window, so the keyboard's top edge is Android's answer, not a guess.
 * Exits 1 when the target is covered, and when no keyboard can be found: a
 * probe that cannot see the keyboard has measured nothing.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RECT = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/;

/** The input method window's visible top, in pixels, or null when none is shown. */
export function keyboardTop(windows) {
  const blocks = windows.replace(/\r\n/g, '\n').split(/\n(?=\s*Window #\d+)/);
  const ime = blocks.find((b) => /^\s*Window #\d+ Window\{\w+ u\d+ InputMethod\}/.test(b));
  if (!ime) return null;
  if (/isOnScreen=false|mViewVisibility=0x[48]\b|isVisible=false/.test(ime)) return null;
  const frame = /(?:^|\s)(?:m)?[Ff]rame=(\[[^\]]+\]\[[^\]]+\])/m.exec(ime);
  const r = frame && RECT.exec(frame[1]);
  if (!r) return null;
  const given = /mGivenContentInsets=(\[[^\]]+\]\[[^\]]+\])/.exec(ime);
  const inset = given ? Number(RECT.exec(given[1])?.[2] ?? 0) : 0;
  const top = Number(r[2]) + inset;
  return top > 0 && Number(r[4]) > top ? top : null;
}

/** The input method window's visible height, in pixels, or null when none is shown. */
export function keyboardHeight(windows) {
  const top = keyboardTop(windows);
  if (top == null) return null;
  const blocks = windows.replace(/\r\n/g, '\n').split(/\n(?=\s*Window #\d+)/);
  const ime = blocks.find((b) => /^\s*Window #\d+ Window\{\w+ u\d+ InputMethod\}/.test(b)) ?? '';
  const frame = /(?:^|\s)(?:m)?[Ff]rame=(\[[^\]]+\]\[[^\]]+\])/m.exec(ime);
  return Number(RECT.exec(frame[1])[4]) - top;
}

/**
 * Which panel the keyboard shows, by the key Gboard names on each (a `maestro hierarchy` with the
 * keyboard up holds its keys): the letters carry "Symbol keyboard" (the ?123 key), the emoji panel
 * "Letter keyboard" (the ABC key back). An address field's letters name no "Q", so the letters are
 * never read from a letter (run 43242130602). Null when neither key is there: the panel not known.
 */
export function panelOf(tree) {
  const names = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    names.add((node.attributes?.accessibilityText ?? '').trim());
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  if (names.has('Symbol keyboard')) return 'letters';
  if (names.has('Letter keyboard')) return 'emoji';
  return null;
}

/** The first element matching `#id` or `"text"`, with its bounds. */
export function findTarget(tree, target) {
  const byId = target.startsWith('#') ? target.slice(1) : null;
  const byText = byId ? null : target.replace(/^"|"$/g, '');
  let hit = null;
  const walk = (node) => {
    if (hit || !node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    const id = a['resource-id'] || a.resourceId || '';
    const matches = byId
      ? id === byId || id.endsWith(`:id/${byId}`)
      : (a.text || '').trim() === byText || (a.accessibilityText || '').trim() === byText;
    const r = RECT.exec(a.bounds || '');
    if (matches && r) {
      hit = { left: +r[1], top: +r[2], right: +r[3], bottom: +r[4] };
      return;
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return hit;
}

/**
 * The same, from `uiautomator dump` (XML): Android's own dump of the app's
 * window. With a keyboard up, Maestro's hierarchy mixes in the keyboard's
 * window and did not hand back a field the app was drawing.
 */
export function findTargetXml(xml, target) {
  const byId = target.startsWith('#') ? target.slice(1) : null;
  const byText = byId ? null : target.replace(/^"|"$/g, '');
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(node)?.[1] ?? '';
    const id = attr('resource-id');
    const matches = byId
      ? id === byId || id.endsWith(`:id/${byId}`)
      : attr('text').trim() === byText || attr('content-desc').trim() === byText;
    const r = RECT.exec(attr('bounds'));
    if (matches && r) return { left: +r[1], top: +r[2], right: +r[3], bottom: +r[4] };
  }
  return null;
}

/**
 * Whether a field and its press stand apart: neither drawn over the other. Both clear of the keys
 * is not enough: a field the scroll brings to the keyboard's top lies under a press riding there.
 */
export function apart(name, a, b, boxA, boxB) {
  if (!boxA || !boxB) return { ok: false, line: `${name}: ${!boxA ? a : b} not found on screen, so ${a} and ${b} were not compared` };
  const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
  const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
  return overlapX > 0 && overlapY > 0
    ? { ok: false, line: `${name}: ${a} UNDER ${b} — ${overlapY}px of it drawn over (${a} ${boxA.top}..${boxA.bottom}px, ${b} ${boxB.top}..${boxB.bottom}px)` }
    : { ok: true, line: `${name}: ${a} and ${b} stand apart (${a} ${boxA.top}..${boxA.bottom}px, ${b} ${boxB.top}..${boxB.bottom}px)` };
}

/** One line saying what was measured, and whether it is a finding. */
export function verdict(name, target, bounds, top) {
  if (top == null) return { ok: false, line: `${name}: NO KEYBOARD on screen — nothing was measured` };
  if (!bounds) return { ok: false, line: `${name}: ${target} not found on screen (keyboard top ${top}px)` };
  const over = bounds.bottom - top;
  return over > 0
    ? { ok: false, line: `${name}: ${target} COVERED — its foot at ${bounds.bottom}px, the keyboard from ${top}px (${over}px under it)` }
    : { ok: true, line: `${name}: ${target} clear — its foot at ${bounds.bottom}px, the keyboard from ${top}px` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === '--top') {
  // Is the keyboard's window there and drawn yet: run-flows.sh asks until it is (exit 0).
  let windows = '';
  try { windows = readFileSync(process.argv[3] ?? '', 'utf8'); } catch { /* none yet */ }
  process.exit(keyboardTop(windows) == null ? 1 : 0);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === '--apart') {
  // A field and its press, neither over the other: run-flows.sh asks after judging each against the keys.
  const [name, a, b, hierarchyFile, dumpFile] = process.argv.slice(3);
  let tree = null;
  try { tree = JSON.parse(readFileSync(hierarchyFile ?? '', 'utf8')); } catch { /* the dump alone, then */ }
  let dump = '';
  try { dump = dumpFile ? readFileSync(dumpFile, 'utf8') : ''; } catch { /* the hierarchy alone, then */ }
  const find = (t) => (dump && findTargetXml(dump, t)) || (tree && findTarget(tree, t)) || null;
  const v = apart(name, a, b, find(a), find(b));
  console.log(v.line);
  process.exit(v.ok ? 0 : 1);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === '--panel') {
  // Which of its panels the keyboard shows, and how tall it stands: run-flows.sh asks after each
  // change, so a press that did not open the emoji panel fails, by name, before anything is judged.
  // A keyboard whose panel cannot be named fails too: a check that cannot say which has said nothing.
  const [want, hierarchyFile, windowsFile] = process.argv.slice(3);
  let tree = null;
  try { tree = JSON.parse(readFileSync(hierarchyFile ?? '', 'utf8')); } catch { /* said below */ }
  let windows = '';
  try { windows = readFileSync(windowsFile ?? '', 'utf8'); } catch { /* said below as no window */ }
  const height = keyboardHeight(windows);
  if (!tree) { console.log('the keyboard: the screen could not be read, so its panel is not known'); process.exit(1); }
  const shows = panelOf(tree);
  const said = (p) => (p === 'letters' ? 'its letters' : p === 'emoji' ? 'its emoji panel' : 'neither its letters nor its emoji panel');
  console.log(`the keyboard shows ${said(shows)}${height == null ? ', and no window of its own' : `, ${height}px tall`}`
    + (shows === want ? '' : ` (it should show ${said(want)})`));
  process.exit(shows === want && height != null ? 0 : 1);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [name, target, hierarchyFile, windowsFile, dumpFile] = process.argv.slice(2);
  if (!name || !target || !hierarchyFile || !windowsFile) {
    console.error('usage: node e2e/keyboard-room.mjs <name> <#id|"text"> <hierarchy> <windows> [dump.xml]');
    process.exit(2);
  }
  let tree = null;
  try { tree = JSON.parse(readFileSync(hierarchyFile, 'utf8')); } catch { /* reported below as not found */ }
  let windows = '';
  try { windows = readFileSync(windowsFile, 'utf8'); } catch { /* reported below as no keyboard */ }
  let dump = '';
  try { dump = dumpFile ? readFileSync(dumpFile, 'utf8') : ''; } catch { /* the hierarchy alone, then */ }
  const bounds = (dump && findTargetXml(dump, target)) || (tree && findTarget(tree, target));
  const v = verdict(name, target, bounds, keyboardTop(windows));
  console.log(v.line);
  process.exit(v.ok ? 0 : 1);
}
