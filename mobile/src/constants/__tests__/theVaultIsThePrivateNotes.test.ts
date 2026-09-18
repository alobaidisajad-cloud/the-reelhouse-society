/**
 * theVaultIsThePrivateNotes.test.ts — one word, one thing.
 * ─────────────────────────────────────────────────────────────────────────────
 * "The Vault" named two different things. The Society page sells
 * "The Vault (Private Notes)", and the log form's private-notes panel is THE
 * VAULT. The profile's shelf of discs and tapes was ALSO The Vault — on its rail,
 * its page title, its search, its import receipt, a passport stamp.
 *
 * It did real damage, not just confusion: the biometric lock in front of a
 * member's own Archive was named VaultLock, and Settings, reading that name,
 * told members it guarded their Physical Archive. It never did.
 *
 * The notes keep the name — a vault is where you keep what is private — and the
 * shelf is the Physical Archive, the name the web always used.
 *
 * ── WHAT THIS HOLDS ─────────────────────────────────────────────────────────
 * Every string and every piece of JSX text in the app that says "vault" is
 * either a WIRE value nobody reads (a feature id, a cache key, an action type)
 * or one of the uses listed below, each of which is about the private notes.
 * A new screen that calls anything else a vault fails here. And each listed use
 * must still exist, so this list cannot quietly rot into permission for nothing.
 *
 * Parsed with the project's own compiler — comments are not strings, so they
 * are left out by construction rather than by a regex that guesses.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
};

const rel = (f: string) => relative(MOBILE, f).replace(/\\/g, '/');

type Said = { file: string; text: string };

/** Every string literal, template piece and JSX text that says "vault". */
const sayings = (files: string[]): Said[] => {
  const out: Said[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/vault/i.test(src)) continue;
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
    const visit = (n: any) => {
      let text: string | null = null;
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return; // module paths
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
        || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
      else if (ts.isJsxText(n)) text = n.text.trim();
      if (text && /vault/i.test(text)) out.push({ file: rel(file), text });
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
};

/** A value on the wire, never on the page: an id, a key, an action type. */
const isWire = (s: string) =>
  /^[A-Za-z0-9_:-]+$/.test(s)                 // the-vault, vault_keeper, SET_VAULT_PAGE, ironvault_user_cache_
  || /^\[[A-Za-z]+\]/.test(s);                // a logger tag: "[ProfileFetch] loadMoreVault error:"

/** The uses of the word a member meets — every one of them about the private notes. */
const PRIVATE_NOTES: Said[] = [
  { file: 'src/constants/membership.ts', text: 'The Vault (Private Notes)' },
  { file: 'src/constants/gatedFeatures.ts', text: 'The Vault (Private Notes)' },
  { file: 'src/components/log/LogForm.tsx', text: 'THE VAULT' },
  { file: 'src/components/log/LogForm.tsx', text: 'The Vault' },
  { file: 'src/lore/fragments.ts', text: 'The Vault has never been breached. Your private notes are yours alone.' },
  // The registry's own account of where the rope sits — the log form's notes panel.
  { file: 'src/constants/gatedFeatures.ts', text: 'Vault panel in the log form is roped by the-vault and the note field is ' },
  { file: 'src/constants/gatedFeatures.ts', text: 'Vault is an Archivist feature" while their clear and their remove both ' },
  // The note itself, where a member reads it and opens it (2026-09-18).
  { file: 'src/components/log/VaultNote.tsx', text: 'THE VAULT' },
  { file: 'src/components/log/NoteSheet.tsx', text: 'THE VAULT' },
  { file: 'src/components/log/LogForm.tsx', text: 'Opening the Vault…' },
  // The rank gate's own refusal, matched rather than guessed at.
  { file: 'src/services/VaultService.ts', text: 'The Vault is an Archivist feature' },
  // A telemetry scope for the notes store. Not on a page, but not wire-shaped
  // either (the dot), so it is listed rather than excused.
  { file: 'src/stores/vaultStore.ts', text: 'vault.loadForLog' },
  { file: 'src/constants/gatedFeatures.ts', text: 'screen that edited a shelf entry (vault-modal) was unreachable and is gone. ' },
];

/**
 * The web app says it too — the word is the product's, not one client's. The
 * web had drifted further: a profile box reading "THE VAULT — N TITLES WITHIN"
 * over the member's WATCHLIST count, "THE VAULT IS SEALED" on empty search
 * results, and a handbook calling the whole profile "The Ledger / Vault".
 */
const WEB_PRIVATE_NOTES: Said[] = [
  { file: '../src/pages/MembershipPage.tsx', text: 'The Vault (Private Notes)' },
  { file: '../src/components/HandbookModal.tsx', text: 'The Vault' },
];
PRIVATE_NOTES.push(...WEB_PRIVATE_NOTES);

const key = (s: Said) => `${s.file}  ${JSON.stringify(s.text)}`;
const ALL = sayings([
  ...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src')),
  ...walk(join(MOBILE, '..', 'src')),
]);

describe('"The Vault" is the private notes, and nothing else', () => {
  it('no text in the app calls anything else a vault', () => {
    const allowed = new Set(PRIVATE_NOTES.map(key));
    const offenders = ALL.filter(s => !isWire(s.text) && !allowed.has(key(s))).map(key);
    expect(offenders).toEqual([]);
  });

  it('every use listed above still exists — the list is not permission for nothing', () => {
    const found = new Set(ALL.map(key));
    expect(PRIVATE_NOTES.map(key).filter(k => !found.has(k))).toEqual([]);
  });

  it('the scan can see — it finds the notes panel, and would find the old shelf name', () => {
    // A scan that read no files would pass the first test by finding nothing.
    expect(ALL.length).toBeGreaterThan(10);
    const probe = join(MOBILE, 'app', 'user', '[username].tsx');
    const src = readFileSync(probe, 'utf8');
    expect(src).toContain("physical: 'The Physical Archive'");
    const kind = ts.ScriptKind.TSX;
    const planted = ts.createSourceFile('x.tsx', `const T = { physical: 'The Vault' };`, ts.ScriptTarget.Latest, true, kind);
    let seen = '';
    const visit = (n: any) => { if (ts.isStringLiteral(n)) seen = n.text; ts.forEachChild(n, visit); };
    visit(planted);
    expect(seen).toBe('The Vault');
    expect(isWire(seen)).toBe(false);
  });
});
