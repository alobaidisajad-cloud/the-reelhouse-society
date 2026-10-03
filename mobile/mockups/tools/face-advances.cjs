/**
 * FACE ADVANCES — how wide each character of the app's measured faces is, read
 * from the app's own font files, as tables the app does arithmetic with.
 *
 *   node mockups/tools/face-advances.cjs           writes src/theme/faceAdvances.ts
 *   node mockups/tools/face-advances.cjs --check   fails if that file is not what the fonts say (CI)
 *
 * The Lobby decides by these widths whether a line of its own words fits the
 * room it is given at the member's text size — and when it does not, the
 * layout gives way rather than a line wrapping, being cut or shrinking. The
 * member page chooses the largest size at which a name's longest word fits its
 * column. A character count cannot tell a W from an I; these can.
 *
 * Every printable character of ASCII and Latin-1, and the house's own marks,
 * that the face itself draws. A character it does not draw (✦ in Rye, Arabic,
 * CJK…) is left out, and the app measures it as the face's widest letter, so an
 * unknown letter never fits where it would not.
 *
 * Read from the files themselves (`cmap` for which characters a face draws,
 * `hmtx` for each glyph's advance, `head` for its units per em), not measured
 * in a browser: a browser fills a missing character from the machine's own
 * fonts, so its table differed between this machine and CI's.
 *
 * One tool and one file: the profile's Rye table was once a second tool's
 * second file, the same widths kept twice.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..', '..');
const FONT_DIR = path.join(MOBILE, 'node_modules', '@expo-google-fonts');

const CHARS = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...Array.from({ length: 0xff - 0xa1 + 1 }, (_, i) => String.fromCharCode(0xa1 + i)),
  '’', '‘', '“', '”', '—', '–', '…', '·', '✦', '›', '★', '№',
];

// [the name in the table, the face's file]
const FACES = [
  ['RYE', 'rye/400Regular/Rye_400Regular.ttf'],
  ['ELITE', 'special-elite/400Regular/SpecialElite_400Regular.ttf'],
  ['COURIER_ITALIC', 'courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf'],
  ['SPECTRAL_ITALIC', 'spectral/400Regular_Italic/Spectral_400Regular_Italic.ttf'],
];

const DEST = path.join(MOBILE, 'src', 'theme', 'faceAdvances.ts');

/** The TrueType tables this needs: units per em, each glyph's advance, and the character map. */
function readFace(file) {
  const b = fs.readFileSync(file);
  const tables = {};
  const count = b.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    tables[b.toString('latin1', at, at + 4)] = { offset: b.readUInt32BE(at + 8), length: b.readUInt32BE(at + 12) };
  }
  for (const t of ['head', 'hhea', 'hmtx', 'cmap']) if (!tables[t]) throw new Error(`${file}: no ${t} table`);

  const unitsPerEm = b.readUInt16BE(tables.head.offset + 18);
  const metrics = b.readUInt16BE(tables.hhea.offset + 34);
  const advanceOf = (gid) => b.readUInt16BE(tables.hmtx.offset + 4 * Math.min(gid, metrics - 1));

  // The Unicode character map: format 12 (full range) if the face has one, else format 4 (BMP).
  const cmap = tables.cmap.offset;
  const subtables = [];
  for (let i = 0; i < b.readUInt16BE(cmap + 2); i++) {
    const at = cmap + 4 + i * 8;
    const platform = b.readUInt16BE(at), encoding = b.readUInt16BE(at + 2);
    const offset = cmap + b.readUInt32BE(at + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode) subtables.push({ format: b.readUInt16BE(offset), offset });
  }
  const sub = subtables.find((s) => s.format === 12) ?? subtables.find((s) => s.format === 4);
  if (!sub) throw new Error(`${file}: no Unicode character map`);

  const glyphOf = (cp) => {
    if (sub.format === 12) {
      const groups = b.readUInt32BE(sub.offset + 12);
      for (let i = 0; i < groups; i++) {
        const at = sub.offset + 16 + i * 12;
        const start = b.readUInt32BE(at), end = b.readUInt32BE(at + 4);
        if (cp >= start && cp <= end) return b.readUInt32BE(at + 8) + (cp - start);
      }
      return 0;
    }
    if (cp > 0xffff) return 0;
    const segs = b.readUInt16BE(sub.offset + 6) / 2;
    const ends = sub.offset + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    for (let i = 0; i < segs; i++) {
      if (cp > b.readUInt16BE(ends + i * 2)) continue;
      const start = b.readUInt16BE(starts + i * 2);
      if (cp < start) return 0;
      const delta = b.readInt16BE(deltas + i * 2);
      const rangeAt = ranges + i * 2;
      const range = b.readUInt16BE(rangeAt);
      if (range === 0) return (cp + delta) & 0xffff;
      const g = b.readUInt16BE(rangeAt + range + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  return { unitsPerEm, advanceOf, glyphOf };
}

const tables = {};
for (const [name, file] of FACES) {
  const face = readFace(path.join(FONT_DIR, file));
  const t = {};
  for (const ch of CHARS) {
    // A soft hyphen is drawn only where a line breaks at it; within a line it
    // takes no room, in any face, whether or not the face has a glyph for it.
    if (ch === '\u00AD') { t[ch] = 0; continue; }
    const gid = face.glyphOf(ch.codePointAt(0));
    if (gid === 0) continue; // the face does not draw it: the app measures it as the widest
    t[ch] = Math.round((face.advanceOf(gid) / face.unitsPerEm) * 1000) / 1000;
  }
  tables[name] = t;
}

const block = (name, table) => {
  const widest = Math.max(...Object.values(table));
  // A hidden character is written as its escape: raw, it is invisible in review (noControlCharacters).
  const rows = Object.entries(table).map(([ch, w]) => `  ${JSON.stringify(ch).replace(/[\u00AD\u200B-\u200F\u2028\u2029\u2060-\u2064\uFEFF]/g, (h) => '\\u' + h.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))}: ${w},`).join('\n');
  return `export const ${name}: Readonly<Record<string, number>> = {\n${rows}\n};\n/** A letter the table does not hold is measured as the widest it does. */\nexport const ${name}_WIDEST = ${widest};\n`;
};
const out = `/**
 * GENERATED by mockups/tools/face-advances.cjs from the app's own font files —
 * do not edit by hand; run the tool. Each value is a character's advance in ems.
 */
${FACES.map(([name]) => block(name, tables[name])).join('\n')}`;

if (process.argv.includes('--check')) {
  const now = fs.existsSync(DEST) ? fs.readFileSync(DEST, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== out) {
    console.log(`::error title=Face advances::${path.relative(MOBILE, DEST)} is not what the font files measure — run: node mockups/tools/face-advances.cjs`);
    process.exit(1);
  }
  console.log(`${path.relative(MOBILE, DEST)} matches the font files`);
} else {
  fs.writeFileSync(DEST, out);
  console.log('wrote', path.relative(MOBILE, DEST), Object.fromEntries(FACES.map(([n]) => [n, Object.keys(tables[n]).length])));
}
