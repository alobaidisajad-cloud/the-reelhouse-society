/**
 * colorLock.test.ts — the color endgame lock (a ratchet).
 * ────────────────────────────────────────────────────────
 * Companion to the font lock in theme.ts: raw hex colors belong in the
 * theme's Shade Ledger, not scattered through components. This test scans
 * the app's code (appCode, test-utils/universe.js) for hex literals; each
 * file's count may never EXCEED the committed baseline
 * (scripts/color-lock-baseline.json). So:
 *   • writing a NEW raw hex anywhere → the suite fails (drift caught in CI)
 *   • migrating a hex to a token → lower the baseline (ratchet tightens)
 * Regenerate the baseline ONLY after deliberate cleanups:
 *   UPDATE_COLOR_LOCK=1 npx jest colorLock
 * Artwork and design-data files are exempt — art is art:
 * the logo, Buster, icon SVGs, the Darkroom mood table, format badges,
 * and the share-card canvas keep their own pigments.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { files, rel } from '../test-utils/universe';

const ROOT = join(__dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'color-lock-baseline.json');

/** Artwork / design-data — exempt by design, not by neglect. */
const EXEMPT = [
  'src/theme/theme.ts',
  'src/components/MasterLogo.tsx',
  'src/components/Buster.tsx',
  'src/components/darkroom/constants.ts',
  'src/constants/formats.ts',
  'src/components/profile/TasteDNAExportCanvas.tsx',
  // TMDB's own wordmark: another house's mark, its pigments as TMDB publishes them, never ours to name.
  'src/components/TmdbCredit.tsx',
];

// #RGB / #RRGGBB / #RRGGBBAA — pure black is allowed anywhere (it is what
// shadows are made of; the booth law's one universal pigment).
const HEX_RE = /#[0-9A-Fa-f]{3,8}\b/g;
const ALLOWED = new Set(['#000', '#000000']);

function census(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files('appCode').map(rel)) {
    if (EXEMPT.includes(file)) continue;
    const text = readFileSync(join(ROOT, file), 'utf8');
    const real = (text.match(HEX_RE) || []).filter(h => !ALLOWED.has(h.toLowerCase()));
    if (real.length > 0) counts[file] = real.length;
  }
  return counts;
}

describe('color lock (raw-hex ratchet)', () => {
  it('no file uses more raw hex colors than the committed baseline', () => {
    const current = census();

    if (process.env.UPDATE_COLOR_LOCK === '1') {
      writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
      return; // baseline regenerated deliberately — nothing to assert
    }

    expect(existsSync(BASELINE_PATH)).toBe(true);
    const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    // A census of nothing would pass: the app's own art is always counted.
    expect(Object.keys(current).length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const [file, count] of Object.entries(current)) {
      const allowed = baseline[file] ?? 0;
      if (count > allowed) {
        violations.push(`${file}: ${count} raw hex(es), baseline allows ${allowed} — name the shade in theme.ts instead`);
      }
    }
    expect(violations).toEqual([]);
  });
});
