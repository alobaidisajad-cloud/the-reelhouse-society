#!/usr/bin/env node
/**
 * keyboard-room.mjs — is what the member needs above the keyboard, or under it?
 *
 *   node e2e/keyboard-room.mjs <name> <target> <hierarchy> <windows>
 *   node e2e/keyboard-room.mjs --top <windows>     exit 0 once the keyboard's window is there and drawn
 *   node e2e/keyboard-room.mjs --apart <name> <field> <press> <hierarchy> [dump.xml]
 *                                                  exit 0 when neither is drawn over the other
 *   node e2e/keyboard-room.mjs --panel <letters|emoji> <hierarchy> <windows> [letters hierarchy]
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
 * its tabs, and the symbols page "Letter keyboard" (the ABC key back) without them. An address
 * field's letters name no "Q", so the letters are never read from a letter (run 43242130602). Null
 * when none is there: the panel not known.
 */
export function panelOf(tree) {
  const names = keyNames(tree);
  if (LETTERS_KEY.some((k) => names.has(k))) return 'letters';
  // The emoji panel by its own tabs (emoji, GIFs, stickers: Gboard's key_pos_non_prime_category_N, in
  // every language alike); the ABC key alone is the symbols page's too, which is not the emoji panel.
  if (keyIds(tree).some((id) => EMOJI_PANEL_TAB.test(id))) return 'emoji';
  if (EMOJI_PANEL_KEY.some((k) => names.has(k))) return 'symbols';
  return null;
}

/**
 * Whether the letters keep no emoji key, their emoji key's place given to the address key (".com",
 * Gboard's key_pos_switch_to_smiley named "Dot com") or to no key at all: an address field's. The tablet's Gboard draws
 * its GIF and sticker keys off there too, so its emoji panel cannot be reached (nightly 45676715897's
 * screen: the recovery card's letters, ?123 and the header's GIF tapped, the letters stayed).
 */
export function lettersKeepNoEmoji(tree) {
  const slot = emojiPlaceOf(tree);
  // And letters with no key in that place at all: the Arabic phone's recovery card (nightly
  // 45916711026: "the letters had no key in the emoji place").
  return slot === null || ADDRESS_KEY.includes(slot);
}

/** The name of the key in the letters' emoji place (key_pos_switch_to_smiley), or null where there is none. */
export function emojiPlaceOf(tree) {
  let slot = null;
  const walk = (node) => {
    if (slot !== null || !node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    if (/:id\/key_pos_switch_to_smiley$/.test(a['resource-id'] ?? '')) { slot = (a.accessibilityText ?? '').trim(); return; }
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return slot;
}

/**
 * The judge's rule, per field: the tallest panel a member can open on it is the one measured. The
 * emoji panel stands tallest, so it is demanded on every field whose letters keep their emoji key,
 * and on every field whose letters were not read. Only letters seen to keep no emoji key, its place
 * the address key's or no key's (lettersKeepNoEmoji), reach no emoji panel from the letters: there
 * the flow presses the GIF key and the symbols' emoji key a member would press, and an emoji panel
 * opened by either passes; else the tallest panel left is the symbols page, and judging it measures
 * what the member can open, never less.
 */
export function tallestReachablePanel(letters) {
  return letters !== null && lettersKeepNoEmoji(letters) ? 'symbols' : 'emoji';
}

/**
 * The resource id of the letters' ?123 key (the key LETTERS_KEY names), without its package: '' when
 * that key carries none, null when the screen holds no such key. A flow that presses the key by its id
 * presses it in every language, where its name is the phone's.
 */
export function symbolsKeyIdOf(tree) {
  let id = null;
  const walk = (node) => {
    if (id !== null || !node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    const name = (a.accessibilityText ?? '').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '').trim();
    if (LETTERS_KEY.includes(name)) { id = (a['resource-id'] ?? '').replace(/^.*:id\//, ''); return; }
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return id;
}

/**
 * The keyboard's keys that carry both a resource id and a name of more than one character, as
 * `id "name"` (the id without its package): a symbols page says so which key opens its emoji panel,
 * in the phone's language, so a flow can press it by what it is.
 */
export function namedKeysOf(tree) {
  const keys = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const a = node.attributes ?? {};
    const id = /:id\/(?<id>key_pos_\w+)$/.exec(a['resource-id'] ?? '')?.groups?.id;
    const name = (a.accessibilityText ?? '').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '').trim();
    if (id && [...name].length > 1) keys.push(`${id} "${name}"`);
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return keys;
}

/** Every resource id on the screen. */
function keyIds(tree) {
  const ids = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.attributes?.['resource-id']) ids.push(node.attributes['resource-id']);
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return ids;
}
const EMOJI_PANEL_TAB = /:id\/key_pos_non_prime_category_\d+$/;
const ADDRESS_KEY = ['Dot com'];

/**
 * The key each panel names, in each language a run sets the phone to: Gboard speaks the phone's.
 * The right-to-left run's phone is in Arabic (ar-IQ), where the ?123 key is "لوحة مفاتيح الرموز"
 * (nightly 43848225969's hierarchy); a name not yet seen there is printed by --panel when it fails.
 */
const LETTERS_KEY = ['Symbol keyboard', 'لوحة مفاتيح الرموز'];
// The panel's ABC key; in Arabic "لوحة مفاتيح حروف", which the right-to-left run's phone said on every
// night from 2026-11-13, unnamed here until 2026-11-25.
const EMOJI_PANEL_KEY = ['Letter keyboard', 'لوحة مفاتيح حروف'];

/** Every name in the screen, the marks that only set a direction taken out (Gboard leads with them). */
export function keyNames(tree) {
  const names = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    names.add((node.attributes?.accessibilityText ?? '').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '').trim());
    for (const c of node.children ?? []) walk(c);
  };
  walk(tree);
  return names;
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
  // The emoji panel asked for is the tallest panel the field reaches (tallestReachablePanel, read from
  // the same probe's letters): the symbols page only where those letters keep no emoji key. An emoji
  // panel that did open there is taller still, and passes.
  const [want, hierarchyFile, windowsFile, lettersFile] = process.argv.slice(3);
  let tree = null;
  try { tree = JSON.parse(readFileSync(hierarchyFile ?? '', 'utf8')); } catch { /* said below */ }
  let letters = null;
  try { letters = lettersFile ? JSON.parse(readFileSync(lettersFile, 'utf8')) : null; } catch { /* none: the emoji panel, then */ }
  let windows = '';
  try { windows = readFileSync(windowsFile ?? '', 'utf8'); } catch { /* said below as no window */ }
  const height = keyboardHeight(windows);
  if (!tree) { console.log('the keyboard: the screen could not be read, so its panel is not known'); process.exit(1); }
  const shows = panelOf(tree);
  const demanded = want === 'emoji' ? tallestReachablePanel(letters) : want;
  const noEmoji = demanded !== want;
  const ok = shows === want || shows === demanded;
  const said = (p) => (p === 'letters' ? 'its letters' : p === 'emoji' ? 'its emoji panel' : p === 'symbols' ? 'its symbols'
    : 'neither its letters, its symbols nor its emoji panel');
  // A panel it cannot name says the names it saw (words, never single letters), so the next run
  // can be taught them.
  const seen = shows == null ? [...keyNames(tree)].filter((n) => [...n].length > 1).slice(-16) : [];
  // And a failed press says what the letters' emoji place held, by its name in the phone's language,
  // so a key there that is not the emoji key is known by what Gboard calls it.
  const asked = !ok && want === 'emoji' && letters !== null;
  const place = asked ? emojiPlaceOf(letters) : null;
  // The letters' look says the ?123 key's id, or that it carries none, so a flow can press it by
  // what it is rather than by its English name.
  const symbolsId = want === 'letters' && shows === 'letters' ? symbolsKeyIdOf(tree) : null;
  // And a symbols page says its named keys, so the key that opens its emoji panel is known by its id.
  const symbolsKeys = shows === 'symbols' ? namedKeysOf(tree) : [];
  console.log(`the keyboard shows ${said(shows)}${height == null ? ', and no window of its own' : `, ${height}px tall`}`
    + (ok ? (shows === want ? '' : ' (this field\'s letters keep no emoji key: its symbols are the tallest panel a member can open on it)')
      : ` (it should show ${said(want)}${noEmoji ? ' or, this field\'s letters keeping no emoji key, its symbols' : ''})`)
    + (asked ? (place !== null ? `; the letters' emoji place held "${place}"` : '; the letters had no key in the emoji place') : '')
    + (symbolsId === null ? '' : symbolsId ? `; its ?123 key's id: ${symbolsId}` : '; its ?123 key carries no id')
    + (symbolsKeys.length ? `; its keys: ${symbolsKeys.join(' | ')}` : '')
    + (seen.length ? `; the names on the screen: ${seen.join(' | ')}` : ''));
  process.exit(ok && height != null ? 0 : 1);
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
