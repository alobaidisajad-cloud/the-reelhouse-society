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
 * ── A NAME IS NOT AN IMPORT ─────────────────────────────────────────────────
 * This asked whether the NAME appeared anywhere in the app, and that is how a
 * second dead component survived: `PaperDesk` exported `ReportSheet`, and so
 * does `src/components/moderation/ReportSheet`. Three screens import the other
 * one, the name matched in all three, and sixty unmounted lines — carrying a
 * sentence about five reports that the rules page had already struck as false —
 * read as live for as long as the guard existed.
 *
 * So a use now has to come through a real import OF THIS MODULE. The module is
 * identified by its BASENAME, which survives every way this repo writes a path:
 * `@/src/components/dispatch/paper/PaperDesk`, `./PaperDesk`, `../paper/PaperDesk`.
 * Two files with the same basename would put the hole back, and the test below
 * fails if two ever appear.
 */
const importsFrom = (src: string, basename: string): boolean =>
  new RegExp(
    // import … from '…/<basename>'   ·   require('…/<basename>')   ·   import('…')
    `(?:from|require\\(|import\\()\\s*['"][^'"]*(?:^|/)${basename}['"]`,
    'm',
  ).test(src)
  // A bare specifier with no path at all — `from 'PaperDesk'` — is not something
  // this repo writes, but a relative import CAN be exactly `'./PaperDesk'`,
  // which the alternation above already covers via the `/`.
  || new RegExp(`(?:from|require\\(|import\\()\\s*['"]${basename}['"]`).test(src);

/**
 * ── WHAT IS DESIGNED AND NOT WIRED, AND WHY EACH ONE IS NOT ─────────────────
 * This list used to say "finished design work waiting on the plumbing" and
 * leave it there. That was true of some of them and not of others, and an
 * undifferentiated list is how a component nobody will ever wire sits beside
 * one that is a day's work away, for a year, looking identical.
 *
 * So every entry now carries a VERDICT. There are three:
 *
 *   WAITING ON PLUMBING — the screen is wanted and the work is not done.
 *   WAITING ON A BUILD — blocked by a native dependency under the release
 *                        freeze; nothing to decide, something to wait for.
 *   DECIDED AGAINST     — the app already does this, in one voice, and doing
 *                         it twice would be worse. These are candidates for
 *                         deletion the next time this file is opened.
 *
 * Two were deleted this pass rather than frozen — `ReportSheet` and
 * `PaperEvent` — because both had a DEFECT as well as a duplicate: one carried
 * a sentence about five reports that the rules page had already struck as
 * false, and the other's plate drew an event this schema has no trigger for.
 * A frozen component is a record; a frozen component that is WRONG is a
 * proposal waiting to be mistaken for one.
 *
 * The list may only ever SHRINK: anything new that lands here is a component
 * the mockups are keeping alive by accident, which is exactly what took
 * PaperConcierge two hundred lines past its own death.
 */
const DESIGNED_NOT_WIRED = new Set([
  // `FilmPicker` came off this list when the writing room began using it to
  // name the film a dossier is about — the ratchet doing precisely its job.

  // DECIDED AGAINST × 4. The app has a writing room — `ComposeDesks`, and
  // `app/dispatch/compose.tsx` around it — and it is the one that ships, with
  // the toolbar, the preview that is the reader, the film and the series. These
  // four are the alternative that lost. They stay drawn while the design record
  // still refers to them; nothing will mount them.
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DeskHead',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DeskRail',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  WireDesk',
  'src/components/dispatch/paper/PaperDesk.tsx  ::  DossierDesk',
  // KEPT FOR THE RECORD. `EssayPara` is not dead design — it is how the `h1`
  // plate draws the essay's TYPE, beside `h1b` which draws the real path
  // through `EssayBody` and the markdown renderer. The app cannot use it: the
  // renderer builds its own paragraph nodes and a component cannot be threaded
  // into the middle of that. The typography is shared through `ESSAY_BODY`.
  'src/components/dispatch/paper/PaperEssay.tsx  ::  EssayPara',
  // `PaperDoor` came off when the writing room began drawing it — the rule it
  // states has been enforced by `posts_door` all along, and the app had never
  // once mentioned it.
  // `PaperRules` came off when app/dispatch/rules.tsx began mounting it, and
  // the picker — the door every filing goes through — grew the line that opens
  // it. Nine clauses about what a member may file had never been reachable.
  // `PaperArchive` came off when app/dispatch/archive.tsx began mounting it,
  // and the running head grew the magnifier that opens it.
  // `PaperRoom` came off this list when app/dispatch/room/[username].tsx began
  // mounting it — and the four bylines that promised "Open their room" started
  // going there. The ratchet doing its job for the second time.
  // DECIDED AGAINST. The Tribunal exists, is live, and handles every content
  // type this app has with the full range of verdicts — dismiss, remove, warn,
  // mute, suspend, ban. `PaperCase` is the Dispatch's own docket in the paper's
  // voice, for one content type, with two verdicts. It is a nicer object and a
  // worse tool, and it is admin-facing, so no member ever meets the difference.
  'src/components/dispatch/paper/PaperMore.tsx  ::  PaperCase',
  // WAITING ON A BUILD. The story export is a card on a 9:16 ground, and there
  // is nowhere to put the result: writing an image to the photo library needs
  // `expo-media-library`, which is not a dependency and cannot become one
  // without a native build, and the release is frozen. `ShareSheet` documents
  // the same block on its own `card` prop. Nothing to decide.
  'src/components/dispatch/paper/PaperMore.tsx  ::  StoryFrame',
  // DECIDED AGAINST. Sharing a filing into a lounge is wired end to end — the
  // reader's share sheet, `ShareToLoungeModal`, a `dossier_share` message
  // carrying the filing's kind, and `SharedCard` in `app/lounge/[id].tsx` which
  // labels a take as a TAKE and opens the filing when tapped. `LoungeCard` is a
  // second design for a card that already draws.
  'src/components/dispatch/paper/PaperMore.tsx  ::  LoungeCard',
  // `PaperEvent` was DELETED rather than wired: the notices are finished and
  // work — four database triggers write them and the app's own modal routes a
  // tap to the filing — so wiring it would have given the app two notice lists
  // or one list in two visual languages. See the note where it used to be.
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
      const base = rel.split('/').pop()!.replace(/\.tsx?$/, '');
      for (const n of names) {
        const re = new RegExp('\\b' + n + '\\b');
        const usedByApp = appSources.some((other) => {
          if (other === file) return false;
          const src2 = stripComments(readFileSync(other, 'utf8'));
          // The name AND an import of this module. Either alone is not a use:
          // the name alone matched a same-named component in another folder,
          // and the import alone says nothing about which export is taken.
          return re.test(src2) && importsFrom(src2, base);
        });
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
      const base = rel.split('/').pop()!.replace(/\.tsx?$/, '');
      const re = new RegExp('\\b' + name + '\\b');
      const live = appSources.some((other) => {
        if (other === file) return false;
        const src = stripComments(readFileSync(other, 'utf8'));
        return re.test(src) && importsFrom(src, base);
      });
      if (live) stale.push(entry + '   (now mounted — take it off the list)');
    }

    expect(stale).toEqual([]);
  });

  it('has no two modules with the same basename, which would put the hole back', () => {
    /**
     * The import check identifies a module by its FILE NAME. That is exact only
     * while file names are unique — two `PaperDesk.tsx` in different folders and
     * an import of either would vouch for both, which is a smaller version of
     * the same fault this replaced.
     *
     * Only the files this guard reads need to be unique among themselves, and
     * they are: one flat folder of paper components plus the dispatch root.
     */
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
      const base = rel.split('/').pop()!.replace(/\.tsx?$/, '');
      seen.set(base, [...(seen.get(base) ?? []), rel]);
    }
    const collisions = [...seen.entries()].filter(([, v]) => v.length > 1);
    expect(collisions).toEqual([]);
  });

  it('the import check can say NO', () => {
    // Proving the instrument. A file that names a symbol without importing its
    // module must not count as a use — that is the whole repair.
    expect(importsFrom("import ReportSheet from '@/src/components/moderation/ReportSheet';", 'PaperDesk')).toBe(false);
    expect(importsFrom("import { ShareSheet } from '@/src/components/dispatch/paper/PaperDesk';", 'PaperDesk')).toBe(true);
    expect(importsFrom("import { X } from './PaperDesk';", 'PaperDesk')).toBe(true);
    // And it must not match a LONGER name that merely ends the same way.
    expect(importsFrom("import { X } from './MyPaperDesk';", 'PaperDesk')).toBe(false);
  });
});
