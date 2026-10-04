#!/usr/bin/env node
/**
 * grapheme-table.js — writes src/utils/graphemeTable.ts, the table behind the
 * app's one rule for where a character ends (utils/text.ts).
 *
 * The phone's engine (Hermes) has no Intl.Segmenter, so the app carries the
 * rule itself: Unicode's grapheme-cluster rules (UAX #29), run over this table
 * of each code point's break class. The classes are not typed out by hand — a
 * hand-typed table cut Thai, Punjabi, Bengali and Tamil letters in two. Each is
 * read from Node's own segmenter (ICU) by asking it, for every code point, the
 * one question that tells that class apart from the rest. The jest sweep
 * (aCharacterIsNeverCut) then holds the app's rule to the same segmenter, code
 * point by code point.
 *
 *   node scripts/grapheme-table.js          write the table
 *   node scripts/grapheme-table.js --check  exit 1 if the table is not what Node would write
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'utils', 'graphemeTable.ts');
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const count = (s) => [...seg.segment(s)].length;
const one = (...parts) => count(parts.join('')) === 1;
const ch = (cp) => String.fromCodePoint(cp);

/** The break classes, in the order the table's letters name them. */
const CLASSES = ['Other', 'CR', 'LF', 'Control', 'Extend', 'ZWJ', 'RI', 'Prepend', 'SpacingMark',
  'L', 'V', 'T', 'LV', 'LVT', 'ExtPict', 'Consonant', 'Linker', 'ExtendOnly'];
const K = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

const A = 'a';
const ACUTE = ch(0x0301);
const FACE = ch(0x1f600);
const ZWJ = ch(0x200d);
const KA = ch(0x0915);
const VIRAMA = ch(0x094d);

function classOf(cp) {
  if (cp === 0x0d) return K.CR;
  if (cp === 0x0a) return K.LF;
  const x = ch(cp);
  if (one(A, x)) {
    // Joins what comes before it: a joiner, a mark, or a spacing vowel sign.
    if (cp === 0x200d) return K.ZWJ;
    // Only a true extender may sit between an emoji and the joiner of a sequence.
    if (!one(FACE, x, ZWJ, FACE)) return K.SpacingMark;
    if (one(KA, x, KA)) return K.Linker;
    // Between a virama and the consonant it joins, only Indic-conjunct extenders.
    return one(KA, VIRAMA, x, KA) ? K.Extend : K.ExtendOnly;
  }
  if (!one(x, ACUTE)) return K.Control;
  if (one(x, A)) return K.Prepend;
  // Korean parts, each told from the ones not yet ruled out: only a lead joins
  // a lead after it; only a tail follows a tail; then a vowel follows a vowel;
  // then a syllable without a tail takes a vowel, and one with a tail a tail.
  if (one(x, ch(0x1100))) return K.L;
  if (one(ch(0x11a8), x)) return K.T;
  if (one(ch(0x1161), x)) return K.V;
  if (one(x, ch(0x1161))) return K.LV;
  if (one(x, ch(0x11a8))) return K.LVT;
  if (one(x, x) && !one(x, x, x)) return K.RI;
  if (one(FACE, ZWJ, x)) return K.ExtPict;
  if (one(x, VIRAMA, KA) && one(KA, VIRAMA, x)) return K.Consonant;
  return K.Other;
}

function build() {
  const runs = []; // [start, class]
  let last = -1;
  for (let cp = 0; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // halves of a pair, never a code point alone
    const k = classOf(cp);
    if (k !== last) { runs.push([cp, k]); last = k; }
  }
  // One letter per class (A = Other ...), each run as its distance from the last in base 36.
  let prev = 0;
  const data = runs.map(([start, k]) => {
    const s = `${(start - prev).toString(36)}${String.fromCharCode(65 + k)}`;
    prev = start;
    return s;
  }).join('');
  return { runs: runs.length, data };
}

function render({ runs, data }) {
  const lines = [];
  for (let i = 0; i < data.length; i += 100) lines.push(`  '${data.slice(i, i + 100)}'`);
  return `// Written by scripts/grapheme-table.js from Unicode ${process.versions.unicode} (ICU ${process.versions.icu}); do not edit.
// Each code point's grapheme break class, as runs: the distance from the last
// run's start in base 36, then the class's letter (A = ${CLASSES[0]}, B = ${CLASSES[1]}, ...).

export const GRAPHEME_CLASSES = ${JSON.stringify(CLASSES)} as const;

/** ${runs} runs. */
export const GRAPHEME_RUNS =
${lines.join(' +\n')};
`;
}

const text = render(build());
if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== text) { console.error(`${path.relative(process.cwd(), OUT)} is not what this Node would write: run node scripts/grapheme-table.js`); process.exit(1); }
  console.log('the grapheme table is current');
} else {
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${text.length} bytes`);
}
