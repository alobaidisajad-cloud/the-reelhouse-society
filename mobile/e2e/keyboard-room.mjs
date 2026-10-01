#!/usr/bin/env node
/**
 * keyboard-room.mjs — is what the member needs above the keyboard, or under it?
 *
 *   node e2e/keyboard-room.mjs <name> <target> <hierarchy> <windows>
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

/** One line saying what was measured, and whether it is a finding. */
export function verdict(name, target, bounds, top) {
  if (top == null) return { ok: false, line: `${name}: NO KEYBOARD on screen — nothing was measured` };
  if (!bounds) return { ok: false, line: `${name}: ${target} not found on screen (keyboard top ${top}px)` };
  const over = bounds.bottom - top;
  return over > 0
    ? { ok: false, line: `${name}: ${target} COVERED — its foot at ${bounds.bottom}px, the keyboard from ${top}px (${over}px under it)` }
    : { ok: true, line: `${name}: ${target} clear — its foot at ${bounds.bottom}px, the keyboard from ${top}px` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
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
