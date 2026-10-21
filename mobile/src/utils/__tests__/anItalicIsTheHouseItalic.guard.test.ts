/**
 * anItalicIsTheHouseItalic.guard.test.ts — every italic the app sets is a face the house loaded.
 * ─────────────────────────────────────────────────────────────────────────────
 * A face loaded by name has no italic of its own: asked for `fontStyle: 'italic'`, iOS slants
 * the upright letters and Android finds no such face and draws its system font, Roboto, in
 * italics (the route walk's screens, 2026-10-21: the empty states, the notices, Edit Profile).
 * So an italic is always a face of its own (fonts.bodyItalic, fonts.serifItalic), and the slant
 * is never asked for. Rye and Special Elite have no italic: what was slanted in them is set in
 * the house's italic voice instead.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';
import { readCode } from '@/test-utils/readCode';
import { fonts } from '@/src/theme/theme';

const MOBILE = join(__dirname, '..', '..', '..');
const code = universe('appCode').map((f) => ({ f: relative(MOBILE, f).split('\\').join('/'), text: readCode(f) }));

it('reads the app’s code — it is not passing on none', () => {
  expect(code.length).toBeGreaterThan(400);
  expect(code.some(({ f }) => f === 'src/theme/theme.ts')).toBe(true);
});

it('asks for no slant anywhere: an italic is a face of its own', () => {
  const slanted = code.flatMap(({ f, text }) => text.split(/\r?\n/)
    .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
    .filter(({ line }) => /fontStyle\s*[:=]\s*\{?\s*['"]italic['"]/.test(line))
    .map(({ at }) => at));
  expect(slanted).toEqual([]);
});

it('loads every italic face the theme names, before the first screen', () => {
  const layout = readFileSync(join(MOBILE, 'app', '_layout.tsx'), 'utf8');
  const italics = Object.values(fonts).filter((face) => /Italic$/.test(face));
  expect(italics).toEqual(['CourierPrime_400Regular_Italic', 'Spectral_400Regular_Italic']);
  for (const face of italics) expect([face, new RegExp(`useFonts\\(\\{[\\s\\S]*\\b${face},`).test(layout)]).toEqual([face, true]);
});
