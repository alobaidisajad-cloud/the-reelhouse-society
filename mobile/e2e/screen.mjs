#!/usr/bin/env node
/**
 * screen.mjs — what was on the screen, as words.
 *
 *   maestro hierarchy > <file>; node e2e/screen.mjs <file>
 *
 * When a flow fails, the question is always "what WAS there?". A screenshot
 * needs a signed-in download; this prints every element that has an id, a
 * text or a label, one per line, top to bottom — small enough for an
 * annotation, which anyone can read on the run page.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node e2e/screen.mjs <maestro-hierarchy.json>');
  process.exit(2);
}
let tree;
try {
  tree = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.log(`(the hierarchy could not be read: ${e.message})`);
  process.exit(0);
}

const rows = [];
const walk = (node) => {
  if (!node || typeof node !== 'object') return;
  const a = node.attributes ?? {};
  const id = a['resource-id'] || a.resourceId || '';
  const text = (a.text || '').trim();
  const label = (a.accessibilityText || a['content-desc'] || '').trim();
  const top = Number(/\[\d+,(\d+)\]/.exec(a.bounds || '')?.[1] ?? 0);
  // The system's status bar is left out, so an annotation's forty lines are the app.
  if ((id || text || label) && !id.startsWith('com.android.systemui')) {
    const parts = [];
    if (id) parts.push(`#${id}`);
    if (text) parts.push(`"${text.slice(0, 60)}"`);
    if (label && label !== text) parts.push(`[${label.slice(0, 60)}]`);
    rows.push([top, parts.join(' ')]);
  }
  for (const c of node.children ?? []) walk(c);
};
walk(tree);
const seen = new Set();
for (const [, row] of rows.sort((x, y) => x[0] - y[0])) {
  if (seen.has(row)) continue;
  seen.add(row);
  console.log(row);
}
if (!rows.length) console.log('(nothing on screen had an id, a text or a label)');
