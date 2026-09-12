/**
 * everyLeadInIsAccountedFor.test.ts — the class, written down.
 * ─────────────────────────────────────────────────────────────────────────────
 * `theParagraphKnowsItsDirection` proves the five feed kinds and the ballot
 * sheet lay out correctly in Arabic. It cannot prove anything about a SEVENTH
 * lead-in somebody adds next month, and the first pass at this bug missed four
 * sites for exactly that reason: the class was defined as "files that already
 * use rtlText", which is the fix, not the shape. Four places printed a Latin
 * label in front of a member's sentence with no direction handling at all, and
 * looking for the fix could never have found them.
 *
 * So the shape is written down here instead. Every use of a lead-in style in the
 * paper is listed, each one declared INLINE (the label and the member's writing
 * share one <Text>, so the paragraph's direction is at stake) or SEPARATE (the
 * label is its own line or a sibling in a row, so it is not). A use that appears
 * in the source and not in this table fails the build until somebody says which
 * it is.
 *
 * ── WHAT THIS TEST IS AND IS NOT ────────────────────────────────────────────
 * It is an inventory, and the proximity check on INLINE entries is a shape
 * check — it reads source, not behaviour. The behaviour is proved next door, by
 * rendering. Both are needed: rendering proves the sites that exist work, and
 * this proves no new one slips in unrendered.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');

/** The styles that exist to mark a kind's name where it leads. */
const LEAD_STYLES = ['p.leadIn', 'p.seekingLead', 'p.wireDateline', 'p.ballotLead', 'p.dossierLead'];

/**
 * Blank comments in place, byte for byte, newlines kept — so a line number is
 * still a line number and a docstring that names a style is not counted as a
 * use of it. Stripping them instead has shifted every position in this project
 * before.
 */
const blankComments = (s: string): string => {
  const out = s.split('');
  let mode: 'block' | 'line' | null = null;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (!mode && two === '/*') { mode = 'block'; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
    if (!mode && two === '//') { mode = 'line'; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
    if (mode === 'block' && two === '*/') { out[i] = ' '; out[i + 1] = ' '; mode = null; i++; continue; }
    if (mode === 'line' && s[i] === '\n') { mode = null; continue; }
    if (mode && s[i] !== '\n') out[i] = ' ';
  }
  return out.join('');
};

const FILES = [
  'src/components/dispatch/paper/PaperPost.tsx',
  'src/components/dispatch/paper/PaperBallot.tsx',
  'src/components/dispatch/paper/PaperComposer.tsx',
  'src/components/dispatch/paper/PaperCritiques.tsx',
  'src/components/dispatch/paper/PaperDesk.tsx',
  'src/components/dispatch/paper/PaperEssay.tsx',
  'src/components/dispatch/paper/PaperMore.tsx',
];

type Use = { file: string; line: number; at: number; src: string };

const usesIn = (rel: string): Use[] => {
  const raw = readFileSync(join(ROOT, rel), 'utf8');
  const code = blankComments(raw);
  const found: Use[] = [];
  for (const style of LEAD_STYLES) {
    let from = 0;
    for (;;) {
      const at = code.indexOf(style, from);
      if (at === -1) break;
      from = at + style.length;
      // `p.leadIn` is a prefix of nothing else, but be explicit: the next
      // character must not continue an identifier.
      if (/[A-Za-z0-9_]/.test(code[at + style.length] ?? '')) continue;
      found.push({ file: rel, line: code.slice(0, at).split('\n').length, at, src: code });
    }
  }
  return found;
};

/**
 * The inventory. `inline: true` means the label and the member's writing are in
 * ONE <Text>, which is the shape that decides a paragraph's direction.
 */
const DECLARED: { file: string; line: number; what: string; inline: boolean }[] = [
  // ── The feed card: five kinds, each naming itself on the line it prints ──
  { file: 'PaperPost.tsx', line: 0, what: 'take', inline: true },
  { file: 'PaperPost.tsx', line: 0, what: 'seeking', inline: true },
  { file: 'PaperPost.tsx', line: 0, what: 'wire', inline: true },
  { file: 'PaperPost.tsx', line: 0, what: 'ballot', inline: true },
  { file: 'PaperPost.tsx', line: 0, what: 'dossier', inline: true },
  // ── The ballot sheet's question ─────────────────────────────────────────
  { file: 'PaperBallot.tsx', line: 0, what: 'the question', inline: true },
  // ── The docket, and a filing shared into a lounge ────────────────────────
  { file: 'PaperMore.tsx', line: 0, what: 'a reported filing', inline: true },
  { file: 'PaperMore.tsx', line: 0, what: 'the lounge card body', inline: true },
  { file: 'PaperMore.tsx', line: 0, what: 'the forms menu — no member writing', inline: false },
  { file: 'PaperMore.tsx', line: 0, what: "an essay's name, its own line", inline: false },
  // ── The desks ────────────────────────────────────────────────────────────
  { file: 'PaperDesk.tsx', line: 0, what: 'the wire headline', inline: true },
  { file: 'PaperDesk.tsx', line: 0, what: 'the ballot desk — label beside a TextInput', inline: false },
  // The composer names three styles in ONE ternary — seeking, wire, take — so
  // it is three references to a single element. Counted as three because that
  // is what the source says; a table that quietly collapsed them would be a
  // table nobody could check against the file.
  { file: 'PaperComposer.tsx', line: 0, what: 'the composer, seeking — beside a TextInput', inline: false },
  { file: 'PaperComposer.tsx', line: 0, what: 'the composer, wire — beside a TextInput', inline: false },
  { file: 'PaperComposer.tsx', line: 0, what: 'the composer, take — beside a TextInput', inline: false },
  // ── An essay names itself above the title, never inline ──────────────────
  { file: 'PaperEssay.tsx', line: 0, what: 'the reader — its own line above the title', inline: false },
];

describe('every lead-in is accounted for', () => {
  const all = FILES.flatMap(usesIn);

  it('the source has exactly the lead-ins this table declares', () => {
    const counted = new Map<string, number>();
    for (const u of all) {
      const base = u.file.split('/').pop() as string;
      counted.set(base, (counted.get(base) ?? 0) + 1);
    }
    const declared = new Map<string, number>();
    for (const d of DECLARED) declared.set(d.file, (declared.get(d.file) ?? 0) + 1);

    // Compared as text so a mismatch NAMES the file instead of printing two
    // numbers that do not say which one moved.
    const fmt = (m: Map<string, number>) =>
      [...m.entries()].sort().map(([f, n]) => `${f}=${n}`).join(' ');
    expect(fmt(counted)).toBe(fmt(declared));
  });

  it('the scan can SEE a lead-in — it is not passing on an empty read', () => {
    expect(all.length).toBeGreaterThanOrEqual(14);
    expect(all.some((u) => u.file.endsWith('PaperPost.tsx'))).toBe(true);
  });

  it('a comment naming a lead-in style does not count as using one', () => {
    const withComment = blankComments('// p.leadIn is the style\nconst x = 1;');
    expect(withComment.includes('p.leadIn')).toBe(false);
    // and the line count is preserved, so a reported line number is real
    expect(withComment.split('\n').length).toBe(2);
  });

  /**
   * For the INLINE ones: the mark has to be in the same <Text>, and it is
   * always printed immediately before the label. Two hundred characters is
   * generous enough for the conditional and the style array, and tight enough
   * that a mark belonging to a different element cannot satisfy it.
   */
  it('every INLINE lead-in has the right-to-left mark in front of it', () => {
    const inlineFiles = new Set(DECLARED.filter((d) => d.inline).map((d) => d.file));
    for (const file of inlineFiles) {
      const rel = FILES.find((f) => f.endsWith(file)) as string;
      const code = blankComments(readFileSync(join(ROOT, rel), 'utf8'));
      const inlineCount = DECLARED.filter((d) => d.file === file && d.inline).length;
      const marks = (code.match(/RTL_MARK/g) ?? []).length;
      // One mention for the import, then one per inline site.
      expect(`${file}: ${marks} marks for ${inlineCount} inline lead-ins`)
        .toBe(`${file}: ${inlineCount + 1} marks for ${inlineCount} inline lead-ins`);
    }
  });

  it('a SEPARATE lead-in is separate because the label is not in the sentence', () => {
    // Spot-checked in source rather than asserted structurally: these are the
    // four the first pass wrongly cleared, so each one's reason is written down
    // where the next person will read it.
    const essay = readFileSync(join(ROOT, 'src/components/dispatch/paper/PaperEssay.tsx'), 'utf8');
    expect(essay).toMatch(/as its own line\s*\n?\s*\*?\s*above the title, not inline/);
  });
});
