/**
 * THE GROUND LADDER — the enumeration, as a test.
 * ──────────────────────────────────────────────────────────────────────────
 * The app used to sit on twelve near-blacks that nobody could tell apart,
 * hand-mixed one screen at a time: `rgba(10,7,3)` here, `rgb(13,12,8)` there,
 * `rgba(255,255,255,0.05)` on a field because somebody wanted "a bit lighter".
 * Nothing was wrong with any ONE of them. What was wrong is that there were
 * twelve, so a card read as a hole and a recess sat above the page it was
 * supposed to be cut into.
 *
 * Five surfaces now, and this is what keeps it at five. Any SOLID dark ground
 * in `src/` or `app/` must be one of the five steps. A wash is a different
 * idea and is out of scope here: a colour drawn at under 0.9 alpha is a veil
 * laid over something, and what it does depends on what is behind it.
 *
 * The colour lock next door counts hex literals and would not see any of this
 * — the sweep that closed the class wrote `rgb(30,25,20)`, and a lock that
 * only reads `#` is blind to every one of them.
 *
 * ── HOW TO ADD A GROUND ───────────────────────────────────────────────────
 * Use a token. If a surface genuinely needs a sixth step, it goes in the
 * theme with a comment saying what job it does, and `LADDER` here grows by
 * one. Adding a name to `ART` is for pigment that is not a surface at all.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '../theme';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['src', 'app'];

/** The five steps, in the order the theme documents them. */
const LADDER: Record<string, string> = {
  recess: colors.inkwell,
  well: colors.well,
  house: colors.ink,
  card: colors.soot,
  raised: colors.surfaceRaised,
};

/**
 * Pigment, not surfaces. The logo's own black, a mood's colour, a format
 * badge, a share card — these are PICTURES, and a picture is not painted from
 * the furniture catalogue. A share card in particular is seen on somebody
 * else's feed, against their app's white, and not in this booth at all.
 */
const ART = [
  'src/theme/theme.ts',
  'src/assets/logo/reelhouse-logo-data.ts',
  'src/components/MasterLogo.tsx',
  'src/components/Buster.tsx',
  'src/components/ReelEyeIcon.tsx',
  'src/components/darkroom/constants.ts',
  'src/constants/formats.ts',
  'src/components/profile/TasteDNAExportCanvas.tsx',
  'src/components/film/LogShareCard.tsx',
  'src/components/film/ShareCardModal.tsx',
];

/**
 * Named darks that are not rooms. Each one has a job that is not "a surface
 * you read on", and each is a TOKEN — which is the whole point: a name can be
 * argued with in review, and `rgba(12,5,5,1)` typed into a component cannot.
 */
/**
 * See-through ON PURPOSE: a sheet laid over a film, which the backdrop is meant
 * to tint. The sweep that made every near-solid ground solid took the log
 * page's content sheet with the bars — right for a bar over scrolling words,
 * wrong for this — and it was restored. Named here so no blanket rule can do
 * it again, and so nothing else can hide in the exception.
 */
const OVER_ART: Record<string, string> = {
  sheetOverArt: 'the log page’s content sheet, over the film’s backdrop',
  sheetOverArtAuteur: 'the same sheet, in the Auteur’s card',
};

const NOT_A_SURFACE: Record<string, string> = {
  ash: 'the inert tone — a hairline drawn as a box, an empty poster well, a dead control',
  storyGround: 'the canvas of an exported story, seen on somebody else’s feed',
  sootAuteur: 'the card step in the Auteur’s ink — matched to `soot` exactly',
  frame: 'the dark inside a picture frame, which is the card step by another name',
};

// ── colour ────────────────────────────────────────────────────────────────
type Rgba = { r: number; g: number; b: number; a: number };

function parse(value: string): Rgba | null {
  const v = value.trim();
  const hex = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(v);
  if (hex) {
    const n = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return { r: n[0], g: n[1], b: n[2], a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (short) {
    const n = [...short[1]].map((c) => parseInt(c + c, 16));
    return { r: n[0], g: n[1], b: n[2], a: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  return null;
}

/** Perceived lightness. The eye does not read a ground by its channels. */
function lightness(c: Rgba): number {
  const lin = [c.r, c.g, c.b].map((v) => {
    const u = v / 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
}

const same = (a: Rgba, b: Rgba) => a.r === b.r && a.g === b.g && a.b === b.b;

// ── the source ────────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '__tests__', '__mocks__', 'mockups'].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * A ground's value runs to the comma that ENDS it — and `rgb(30,25,20)` is
 * full of commas that do not. A quoted string is taken whole first.
 */
const GROUND = /backgroundColor\s*:\s*((?:'[^']*'|"[^"]*"|[^,\n}])+)/g;

/** Every `backgroundColor:` in the app, with the colour it resolves to. */
function grounds() {
  const found: { file: string; line: number; raw: string; token: string | null; rgba: Rgba }[] = [];
  for (const dir of SCAN) {
    for (const file of walk(dir)) {
      const posix = file.replace(/\\/g, '/');
      if (ART.includes(posix)) continue;
      const text = readFileSync(join(ROOT, file), 'utf8');
      const lines = text.split('\n');
      lines.forEach((ln, i) => {
        // A comment is somebody explaining a colour, not painting with one.
        if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
        for (const m of ln.matchAll(GROUND)) {
          let raw = m[1].trim().replace(/^['"]|['"]$/g, '');
          // `colors.x` and `colors.x as string` both name a token.
          const tok = /^colors\.(\w+)/.exec(raw);
          if (tok) raw = (colors as Record<string, string>)[tok[1]] ?? raw;
          const rgba = parse(raw);
          if (rgba) {
            found.push({ file: posix, line: i + 1, raw: m[1].trim(), token: tok && tok[1], rgba });
          }
        }
      });
    }
  }
  return found;
}

// ── the ladder itself ─────────────────────────────────────────────────────
describe('the ground ladder', () => {
  const steps = Object.entries(LADDER).map(([name, hex]) => {
    const c = parse(hex);
    if (!c) throw new Error(`${name} is not a colour: ${hex}`);
    return { name, hex, L: lightness(c) };
  });

  it('is five surfaces, each one somebody can actually tell from the next', () => {
    // Ordered the way a reader meets them, not the way they are written down.
    const byLight = [...steps].sort((a, b) => a.L - b.L);
    expect(byLight.map((s) => s.name)).toEqual(['recess', 'house', 'well', 'card', 'raised']);

    // The old fault, stated as a number: `soot` sat 0.8 of a perceived step
    // above the page, and 0.8 is not a surface, it is a smudge. The well is
    // the one deliberate exception — it is level with the room by design, so
    // a field reads as an opening onto the house rather than a sixth colour.
    expect(byLight[2].L - byLight[1].L).toBeLessThan(1); // well ≈ house
    expect(byLight[3].L - byLight[2].L).toBeGreaterThan(4); // card is paper
    expect(byLight[4].L - byLight[3].L).toBeGreaterThan(2); // raised is lit
    expect(byLight[1].L - byLight[0].L).toBeGreaterThan(1); // the recess is a cut
  });

  it('is what the splash screen and the icon are painted with', () => {
    // The first surface anybody sees is native, ships with the binary, and
    // cannot be corrected over the air. If it drifts from the house colour
    // the app opens on one black and lands on another.
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
    const splash = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )[1];
    expect(splash.backgroundColor.toUpperCase()).toBe(colors.ink.toUpperCase());
    expect(splash.dark.backgroundColor.toUpperCase()).toBe(colors.ink.toUpperCase());
    expect(app.expo.android.adaptiveIcon.backgroundColor.toUpperCase())
      .toBe(colors.ink.toUpperCase());
  });
});

describe('every ground in the app is on it', () => {
  const all = grounds();

  it('found the grounds at all', () => {
    // A detector that matches nothing reports a clean app. This is the
    // floor under every assertion below it.
    expect(all.length).toBeGreaterThan(200);
    expect(new Set(all.map((g) => g.file)).size).toBeGreaterThan(60);
  });

  /** A ground you could only argue about by measuring it: solid, and dark. */
  const solidDarks = all.filter(
    (g) => g.rgba.a >= 0.9
      && lightness(g.rgba) <= 22
      && !(g.rgba.r === 0 && g.rgba.g === 0 && g.rgba.b === 0), // black is shadow
  );

  it('mixes no dark by hand — every one of them is a name', () => {
    // THIS is the class. Nothing was wrong with any single `rgba(10,7,3)`;
    // what was wrong is that twelve people wrote twelve of them and none of
    // them could see the other eleven. A name can be argued with in review.
    const mixed = solidDarks.filter((g) => !g.token);
    expect(mixed.map((g) => `${g.file}:${g.line} ${g.raw}`)).toEqual([]);
  });

  it('paints no solid dark that is not one of the five, or a stated exception', () => {
    const ladder = Object.values(LADDER).map((h) => parse(h)!);
    const stray = solidDarks.filter(
      (g) => !ladder.some((s) => same(s, g.rgba))
        && !(g.token && (g.token in NOT_A_SURFACE || g.token in OVER_ART)),
    );
    expect(stray.map((g) => `${g.file}:${g.line} ${g.raw}`)).toEqual([]);
  });

  it('and every stated exception is still earning its name', () => {
    // An exemption list nobody prunes becomes the twelve near-blacks again,
    // one apology at a time.
    const used = new Set(solidDarks.map((g) => g.token));
    for (const name of Object.keys(NOT_A_SURFACE)) expect(used.has(name)).toBe(true);
  });

  it('and no near-solid one either — the last few percent only let words ghost through', () => {
    // 0.9–0.99 was the shape of the old fault: a bar meant to be opaque,
    // written with an alpha, that let the page's type show faintly through it.
    const ghosts = solidDarks.filter((g) => g.rgba.a < 1 && !(g.token && g.token in OVER_ART));
    expect(ghosts.map((g) => `${g.file}:${g.line} ${g.raw}`)).toEqual([]);
  });

  it('keeps every sheet that is see-through on purpose — and only those', () => {
    // Both halves: each named sheet is still drawn, still see-through (a solid
    // one would be the sweep's mistake again), and nothing else is on the list.
    const seen = new Set(solidDarks.filter((g) => g.token && g.token in OVER_ART && g.rgba.a < 1).map((g) => g.token));
    expect([...Object.keys(OVER_ART)].filter((k) => !seen.has(k))).toEqual([]);
  });

  it('gives every field the well, and the well to nothing else', () => {
    // The step was defined and worn by nothing at all for a day: the theme
    // documented a surface the app had never painted.
    const wells = all.filter((g) => same(g.rgba, parse(colors.well)!));
    expect(wells.length).toBeGreaterThanOrEqual(24);

    // And it stays the FIELD's colour. A well painted under something nobody
    // types into is the ladder coming apart again, one screen at a time — so
    // every file wearing it has to be a file with a field in it, or a sheet
    // of styles a field reads from.
    const notFields = [...new Set(wells.map((w) => w.file))].filter((f) => {
      const text = readFileSync(join(ROOT, f), 'utf8');
      return !/<TextInput|TextInput>|Input:/.test(text) && !/[Ss]tyles?\.ts$/.test(f);
    });
    expect(notFields).toEqual([]);
  });
});
