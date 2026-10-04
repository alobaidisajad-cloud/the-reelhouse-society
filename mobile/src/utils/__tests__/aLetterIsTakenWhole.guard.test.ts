/**
 * aLetterIsTakenWhole.guard.test.ts — nobody takes a first letter by hand.
 *
 * A first letter taken by hand is one code unit: half an emoji, ज without its
 * dot (another letter), a Korean syllable's first part. A portrait drawn that
 * way shows a broken box or the wrong letter, and a drop cap splits a word.
 * Fifteen places did it, most their own way. Every first letter now comes from
 * `initialOf` / `firstCharacter` in utils/text.ts, which ride the app's one
 * rule for where a character ends.
 *
 * Read from source, comments stripped. What is left over takes a first letter
 * of the app's own English words, or the first ITEM of a list; each says why.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readCode } from '@/test-utils/readCode';

const ROOT = path.join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(f);
  }
  return out;
}
const FILES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]
  .map((f) => ({ rel: path.relative(ROOT, f).replace(/\\/g, '/'), src: readCode(f) }));

/** Every way the app has ever taken a first letter by hand. */
const BY_HAND = /\.charAt\(0\)|\.(?:slice|substring|substr)\(0,\s*1\)|\[0\]\??\.toUpperCase\(|=>\s*\w+\[0\]\)/;

/** Allowed, each with its reason. Matched by file and the line's own words, so a moved line still matches. */
const ALLOWED: [file: string, line: string, why: string][] = [
  ['src/components/profile/profileComputed.ts', "title: k.charAt(0).toUpperCase() + k.slice(1)", 'a link key the app names (twitter, letterboxd)'],
  ['src/hooks/useEditProfile.ts', 'title: k.charAt(0).toUpperCase() + k.slice(1)', 'a link key the app names'],
  ['src/components/ToastHost.tsx', 'return words.charAt(0).toUpperCase() + words.slice(1);', "sentence case for the app's own notice"],
  ['src/features/settings/SettingsSections.tsx', 'const pretty = display.charAt(0) + display.slice(1).toLowerCase();', "a setting's own English label"],
  ['src/components/profile/RoomParts.tsx', '${room[0].toUpperCase()}${room.slice(1)}', "a room's own English name"],
  ['src/components/lobby/FeatureRow.tsx', 'ONE_SHEET.tagline[0].toUpperCase()', "the tagline's first LINE, not its first letter"],
  ['app/(modals)/membership.tsx', '${selectedRank.cta.charAt(0)}${selectedRank.cta.slice(1).toLowerCase()}', "a rank's own English call to action, spoken"],
  ['app/(modals)/search-modal.tsx', '${t.label.charAt(0)}${t.label.slice(1).toLowerCase()}', "a search tab's own English label, spoken"],
  ['app/lounge/[id].tsx', '${typingUsers[0].toUpperCase()}', 'the first member typing, whole: an ITEM, not a letter'],
  ['src/utils/validateWithTelemetry.ts', 'result.error.issues.slice(0, 1)', 'the first ISSUE of a list'],
];

it('reads the app — not an empty sweep', () => {
  expect(FILES.length).toBeGreaterThan(300);
  expect(FILES.some((f) => f.src.includes('initialOf('))).toBe(true);
});

it('catches every shape a hand-taken letter has had here', () => {
  for (const shape of [
    "item.name?.charAt(0)?.toUpperCase() ?? '?'",
    'cleanReview.charAt(0).toUpperCase()',
    'const cap = text.slice(0, 1);',
    "(name || '?')[0].toUpperCase()",
    "name.split(/\\s+/).map((w) => w[0]).join('')",
    'user.username.substring(0, 1)',
  ]) expect([shape, BY_HAND.test(shape)]).toEqual([shape, true]);
  for (const fine of ['initialOf(name)', 'firstCharacter(text)', 'rows[0]', 'list.slice(0, 10)']) {
    expect([fine, BY_HAND.test(fine)]).toEqual([fine, false]);
  }
});

it('every first letter comes from the one rule, and every exception still exists and says why', () => {
  const found = FILES.flatMap((f) => f.src.split('\n')
    .filter((line) => BY_HAND.test(line))
    .map((line) => ({ file: f.rel, line: line.trim() })));
  const unexplained = found
    .filter(({ file, line }) => !ALLOWED.some(([af, al]) => af === file && line.includes(al)))
    .map(({ file, line }) => `${file}: ${line}`);
  expect(unexplained).toEqual([]);

  const stale = ALLOWED
    .filter(([af, al]) => !found.some(({ file, line }) => file === af && line.includes(al)))
    .map(([af, al]) => `${af}: ${al}`);
  expect(stale).toEqual([]);
  for (const [, , why] of ALLOWED) expect(why.length).toBeGreaterThan(10);
});
