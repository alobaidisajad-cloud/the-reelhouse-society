/**
 * nothingLivesOnlyInTheMockups.test.ts — no component may be kept alive by the
 * design record alone.
 * ─────────────────────────────────────────────────────────────────────────────
 * `PaperConcierge.tsx` was 205 lines exporting two components. No screen mounted
 * either. Its only importer in the whole repo was the mockup generator, and the
 * app rendered its own copy of the same card from ConciergeButton — identical
 * title, identical lore, identical three acts, identical descriptions, and no
 * way for a change to one to reach the other.
 *
 * The second export was worse than duplication: it drew the five forms INSIDE
 * the concierge card behind a back arrow, a flow the app does not have. "File to
 * the Dispatch" routes to /dispatch/compose. The plates were showing a screen
 * no member could reach.
 *
 * ── WHY THE DEAD-EXPORT SWEEP MISSED IT ────────────────────────────────────
 * That sweep asks "does anything reference this?" and searches the whole repo,
 * mockups included — so a component a fixture imports reads as used. The right
 * question is narrower: does anything the APP ships reference it?
 *
 * This is the design record's own integrity check. A plate that draws something
 * the app does not mount is not a record, it is a proposal — and one that will
 * be mistaken for a record the moment nobody remembers the difference.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');

const SKIP = new Set(['node_modules', '.git', 'android', 'ios', 'coverage', '.expo', 'out', 'chunks', 'stripped']);

const collect = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) collect(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

/** Comments name symbols without using them; a docstring is not a call site. */
const stripComments = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/**
 * ── WHAT IS DESIGNED BUT NOT YET WIRED ──────────────────────────────────────
 * Fifteen components the mockups draw and no screen mounts. They are not
 * mistakes — they are finished design work waiting on the plumbing:
 *
 *   the door, the house rules, the archive, a member's room, the docket,
 *   the lounge card and its story frame, the events rail,
 *   the wire desk and the DOSSIER desk — the writing room with FILM, COVER and
 *   SERIES, none of which the app's own writing room offers.
 *
 * Frozen here rather than deleted, because deleting them would throw away the
 * design and the record of it. The list may only ever SHRINK: anything new that
 * lands here is a component the mockups are keeping alive by accident, which is
 * exactly what took PaperConcierge two hundred lines past its own death.
 */
const DESIGNED_NOT_WIRED = new Set([
  'src/components/dispatch/ComposeDesks.tsx  ::  FilmPicker',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DeskHead',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DeskRail',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  WireDesk',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DossierDesk',
  'src/components/dispatch/paper/PaperEssay.tsx  ::  EssayPara',
  'src/components/dispatch/paper/PaperFrame.tsx  ::  BrassButton',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperDoor',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperRules',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperArchive',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperRoom',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperCase',
  'src/components/dispatch/paper/PaperMore.tsx  ::  StoryFrame',
  'src/components/dispatch/paper/PaperMore.tsx  ::  LoungeCard',
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperEvent',
]);

describe('the design record draws the app, not a second copy of it', () => {
  const dispatchDir = join(ROOT, 'src', 'components', 'dispatch');
  const files = collect(dispatchDir).filter((f) => !f.includes('__tests__'));

  /** What the app itself ships: src and app, minus tests and mockups. */
  const appSources = [
    ...collect(join(ROOT, 'src')),
    ...collect(join(ROOT, 'app')),
  ].filter((f) => !f.includes('__tests__') && !f.includes('mockups'));

  it('reads the surface at all, so an empty search cannot pass for a clean one', () => {
    expect(files.length).toBeGreaterThanOrEqual(17);
    expect(appSources.length).toBeGreaterThan(100);
  });

  it('has no component that only the mockups mount', () => {
    const orphans: string[] = [];

    for (const file of files) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      const src = stripComments(readFileSync(file, 'utf8'));

      /**
       * Exported COMPONENTS — the things a screen or a plate can mount.
       *
       * PascalCase only: a name must carry a lowercase letter, which is what
       * separates `ConciergeCard` from `MAX_RUN`. The first version matched any
       * capitalised export and reported two constants — `EXCERPT_CHARS` and
       * `MAX_RUN` — as components nothing mounted. They are numbers, read by
       * tests and by the code around them, and neither is a screen.
       */
      const names = [
        ...src.matchAll(/export\s+const\s+([A-Z][A-Za-z0-9]*)\s*=/g),
        ...src.matchAll(/export\s+function\s+([A-Z][A-Za-z0-9]*)/g),
      ].map((m) => m[1]).filter((n) => /[a-z]/.test(n));
      if (!names.length) continue;

      /**
       * EACH export, not the file.
       *
       * The first version asked whether the file had ANY live export, so one
       * mounted component vouched for every dead one beside it. PaperDesk
       * exports six; the app mounts some and `DossierDesk` none, and the whole
       * file passed. A per-file question cannot find a component hiding among
       * its live neighbours.
       */
      for (const n of names) {
        const re = new RegExp('\\b' + n + '\\b');
        const usedByApp = appSources.some(
          (other) => other !== file && re.test(stripComments(readFileSync(other, 'utf8'))),
        );
        if (!usedByApp) orphans.push(rel + '  ::  ' + n);
      }
    }

    const unexpected = orphans.filter((o) => !DESIGNED_NOT_WIRED.has(o));
    expect(unexpected).toEqual([]);
  });

  it('shrinks the list as things get wired, and never grows it quietly', () => {
    // A frozen list that is never re-derived rots into a lie. This fails when a
    // name on it becomes live, so the list is trimmed on the same commit that
    // wires the component up rather than months later.
    const stale: string[] = [];
    const dispatchFiles = collect(dispatchDir).filter((f) => !f.includes('__tests__'));

    for (const entry of DESIGNED_NOT_WIRED) {
      const [rel, name] = entry.split('  ::  ');
      const file = dispatchFiles.find((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/') === rel);
      if (!file) { stale.push(entry + '   (file is gone)'); continue; }
      const re = new RegExp('\\b' + name + '\\b');
      const live = appSources.some(
        (other) => other !== file && re.test(stripComments(readFileSync(other, 'utf8'))),
      );
      if (live) stale.push(entry + '   (now mounted — take it off the list)');
    }

    expect(stale).toEqual([]);
  });
});
