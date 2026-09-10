/**
 * oneWordNamesOneThing.test.ts — the label is a decision, not a column value.
 * ─────────────────────────────────────────────────────────────────────────────
 * "Dossier" named FIVE different things in this app: a member's profile, a
 * film's data panel, a person's biography, a stack of films, and the Dispatch's
 * long form. Four of those are a file compiled ABOUT a subject, which is what
 * the word means. The fifth is somebody's argument at length, which is an essay
 * — and is what every module that builds it has always been called: `PaperEssay`,
 * `EssayHead`, `EssayBody`, `EssayNext`, `SeriesList`, `MAX_LENGTHS.filingEssay`.
 *
 * ── HOW IT DRIFTED, WHICH IS THE PART WORTH PINNING ─────────────────────────
 * Six screens printed `kind.toUpperCase()` straight onto the page. The database
 * column says `dossier`, so the app said DOSSIER — nobody ever chose that word,
 * it leaked out of a schema. Renaming the hardcoded labels alone would have left
 * those six printing the old word for ever, and the app would have contradicted
 * itself on the very screens a member reads most.
 *
 * So this file holds three promises:
 *
 *   THE WIRE DOES NOT MOVE      `kind: 'dossier'` and every table and message
 *                               type keep their names. Live rows carry them.
 *   NOTHING PRINTS A KIND RAW   every member-facing site goes through KIND_NAME.
 *   THE DISPATCH SAYS ESSAY     enumerated, so a new screen cannot reintroduce
 *                               the old word without this failing.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { KIND_NAME, nameOf } from '../paper/paperMetrics';
import { SECTIONS } from '../../../stores/dispatch';

const MOBILE = join(__dirname, '..', '..', '..', '..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
};

/** Comments are prose about the code and are not what a member reads. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const DISPATCH_SURFACE = [
  ...walk(join(MOBILE, 'src', 'components', 'dispatch')),
  ...walk(join(MOBILE, 'app', 'dispatch')),
  join(MOBILE, 'app', '(tabs)', 'dispatch.tsx'),
  join(MOBILE, 'app', 'lounge', '[id].tsx'),
];

const rel = (f: string) => f.slice(MOBILE.length + 1).replace(/\\/g, '/');

describe('the wire does not move', () => {
  it('every kind keeps the value live rows already carry', () => {
    // Renaming any of these would mean rewriting rows in `dispatch_posts`, and
    // every lounge message that quotes one. The keys ARE the column values.
    expect(Object.keys(KIND_NAME).sort())
      .toEqual(['ballot', 'dossier', 'seeking', 'take', 'wire']);
  });

  it('the long form is still `dossier` on the wire and ESSAY on the page', () => {
    expect(KIND_NAME.dossier).toBe('ESSAY');
    expect(nameOf('dossier')).toBe('ESSAY');
  });

  it('an unknown kind prints its own word rather than nothing', () => {
    // A card with an odd lead-in is recoverable. A blank one is not.
    expect(nameOf('manifesto')).toBe('MANIFESTO');
  });

  it('the department reads ESSAYS and still filters on `dossier`', () => {
    expect(SECTIONS).toContain('ESSAYS');
    expect(SECTIONS).not.toContain('DOSSIER');
    const store = readFileSync(join(MOBILE, 'src', 'stores', 'dispatch.ts'), 'utf8');
    expect(store).toContain("ESSAYS: 'dossier'");
  });
});

describe('nothing prints a kind raw', () => {
  it('every member-facing site goes through KIND_NAME, not the column', () => {
    const offenders: string[] = [];
    for (const file of DISPATCH_SURFACE) {
      // `nameOf` itself owns the only `toUpperCase` on a kind — that IS the table.
      if (rel(file).endsWith('paper/paperMetrics.ts')) continue;
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        if (/\bkind\.toUpperCase\(\)/.test(line)) offenders.push(`${rel(file)}:${i + 1}`);
      });
    }
    // This is exactly how the drift started: six screens, none of them wrong on
    // its own, all of them quietly letting a schema choose the app's vocabulary.
    expect(offenders).toEqual([]);
  });
});

describe('the Dispatch says essay, and only the Dispatch decides that', () => {
  /** Values that are wire, not language: a column, a table, a message type. */
  const WIRE = new Set([
    'dossier', 'dossier_share', 'dispatch_dossiers', 'dossier_comments',
    'dossier_certifications', 'add_dossier', 'update_dossier', 'delete_dossier',
    'add_dossier_comment', 'increment_dossier_views', 'toggle_dossier_certify',
    'dossierComment', 'dossierExcerpt', 'dossier/[id]',
  ]);

  it('no printed string in the Dispatch calls the long form a dossier', () => {
    const offenders: string[] = [];
    for (const file of DISPATCH_SURFACE) {
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
          const s = m[1] ?? m[2];
          if (!s || !/dossier/i.test(s)) continue;
          if (WIRE.has(s)) continue;
          // An identifier reached through a string index is still not language.
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) continue;
          offenders.push(`${rel(file)}:${i + 1}  ${s}`);
        }
        // JSX text between tags.
        for (const m of line.matchAll(/>\s*([A-Za-z][^<>{}\n]*?)\s*</g)) {
          if (/dossier/i.test(m[1])) offenders.push(`${rel(file)}:${i + 1}  ${m[1]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('and the four things that ARE files on a subject keep the word', () => {
    /**
     * The point of the rename is that one word names one thing — which fails
     * just as badly if a later sweep takes "dossier" away from the places where
     * it is the correct English. A member's profile IS a file the house keeps
     * on them; so is a film's panel and a person's biography.
     */
    const kept: [string, string][] = [
      ['src/features/profile/EditProfileScreen.tsx', 'THE DOSSIER BUREAU'],
      ['src/features/profile/EditProfileScreen.tsx', 'DOSSIER AMENDED'],
      ['src/components/person/PersonBio.tsx', 'CLASSIFIED DOSSIER — BIOGRAPHY'],
      ['src/lore/fragments.ts', 'Retrieving your dossier from the archive'],
      ['app/user/[username].tsx', 'RETRIEVING DOSSIER'],
    ];
    for (const [file, phrase] of kept) {
      expect(`${file}: ${readFileSync(join(MOBILE, file), 'utf8').includes(phrase)}`)
        .toBe(`${file}: true`);
    }
  });

  it('and a STACK is called a stack, on the screen that lists stacks', () => {
    // This one was the sharpest collision: a button reading COMPILE A DOSSIER,
    // sitting inside the profile — where "your dossier" means the profile.
    const tab = readFileSync(
      join(MOBILE, 'src', 'components', 'profile', 'ProfileListsTab.tsx'), 'utf8');
    expect(tab).toContain('COMPILE A STACK');
    expect(tab).not.toContain('COMPILE A DOSSIER');
  });
});
