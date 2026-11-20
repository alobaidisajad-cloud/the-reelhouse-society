#!/usr/bin/env node
/**
 * icons.cjs — every icon the app draws, its size and the weight of its line as drawn.
 *
 *   node mockups/tools/icons.cjs             each size and drawn line weight
 *   node mockups/tools/icons.cjs --list      and each icon off the ladder, by file and line
 *   node mockups/tools/icons.cjs --check     fails when a file holds more icons off the ladder than
 *                                            its count in mockups/finish-record.json (a new file: none)
 *   node mockups/tools/icons.cjs --lower     writes the counts that fell into the record
 *   node mockups/tools/icons.cjs --json F    the whole measure, as data
 *
 * An icon is a lucide-react-native glyph, drawn by its own name (`<Mail size={16} />`) or handed
 * on and drawn as a component whose name ends in Icon (`<Icon size={16} />`). Lucide draws on a
 * 24-unit grid, so the line a member sees is strokeWidth × size ÷ 24 points (its default 2 on 24).
 * The ladder (mockups/icons-ladder.json) names the sizes an icon may take and the band its drawn
 * line must sit in; an icon outside either is OFF. A size or a weight the code works out is
 * COMPUTED: named, and judged on the drawn page instead.
 */
const fs = require('fs');
const path = require('path');
const { ts, MOBILE, appSources, walk, lineOf, tagOf, attrOf, importsOf, ratchet } = require('./source.cjs');

const LADDER = path.join(MOBILE, 'mockups', 'icons-ladder.json');
const LUCIDE = 'lucide-react-native';
const DEFAULT = { size: 24, strokeWidth: 2 };

/** Each icon one file draws: { line, tag, size, strokeWidth, drawn } (null where computed). */
function iconsOf(src) {
  const imports = importsOf(src);
  const out = [];
  walk(src.tree, (n) => {
    if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxElement(n)) return;
    const tag = tagOf(n);
    const lucide = imports[tag] === LUCIDE;
    if (!lucide && !(/(^|[a-z])Icon$/.test(tag) && !imports[tag])) return;
    const read = (k) => { const a = attrOf(n, k); return a ? (typeof a.value === 'number' ? a.value : null) : DEFAULT[k]; };
    const size = read('size');
    const strokeWidth = read('strokeWidth');
    const drawn = size != null && strokeWidth != null ? Math.round((strokeWidth * size / 24) * 100) / 100 : null;
    out.push({ line: lineOf(src, n), tag, from: lucide ? 'lucide' : 'handed on', size, strokeWidth, drawn });
  });
  return out;
}

/** Why one icon is off the ladder, or null when it is on it (or computed). */
function offOf(icon, ladder) {
  if (icon.size != null && !ladder.sizes.includes(icon.size)) return `size ${icon.size} is not on the ladder (${ladder.sizes.join(', ')})`;
  if (icon.drawn != null && (icon.drawn < ladder.line.min || icon.drawn > ladder.line.max)) return `its line draws ${icon.drawn}pt, outside ${ladder.line.min}–${ladder.line.max}pt`;
  return null;
}

/** The whole measure: per file, its icons, each one off the ladder with why. */
function measure(sources = appSources(), ladder = JSON.parse(fs.readFileSync(LADDER, 'utf8'))) {
  const files = {};
  const sizes = {};
  const lines = {};
  let total = 0;
  let computed = 0;
  for (const src of sources) {
    const icons = iconsOf(src);
    if (!icons.length) continue;
    total += icons.length;
    for (const i of icons) {
      if (i.size == null || i.drawn == null) computed += 1;
      if (i.size != null) sizes[i.size] = (sizes[i.size] ?? 0) + 1;
      if (i.drawn != null) lines[i.drawn] = (lines[i.drawn] ?? 0) + 1;
    }
    const offs = icons.map((i) => ({ i, why: offOf(i, ladder) })).filter((x) => x.why).map(({ i, why }) => `${i.line} <${i.tag}>: ${why}`);
    files[src.rel] = { icons: icons.length, off: offs.length, offs };
  }
  return { ladder, total, computed, sizes, lines, files };
}

function main(argv) {
  const m = measure();
  const at = argv.indexOf('--json');
  if (at >= 0) fs.writeFileSync(argv[at + 1], `${JSON.stringify(m, null, 2)}\n`);
  const off = Object.values(m.files).reduce((a, c) => a + c.off, 0);
  const by = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ');
  console.log(`${m.total} icons drawn (${m.computed} with a size or weight worked out in code), ${off} OFF the ladder`);
  console.log(`sizes: ${by(m.sizes)}\ndrawn line (pt): ${by(m.lines)}`);
  if (argv.includes('--list')) for (const [f, c] of Object.entries(m.files)) if (c.off) console.log(`${f}\n  ${c.offs.join('\n  ')}`);
  return ratchet('icons', m.files, argv, 'icons off the ladder');
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { iconsOf, offOf, measure, LADDER };
