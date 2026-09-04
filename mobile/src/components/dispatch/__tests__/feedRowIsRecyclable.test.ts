/**
 * feedRowIsRecyclable.test.ts — what a recycling list needs, and had not been given.
 * ─────────────────────────────────────────────────────────────────────────────
 * `paperPerf.ts` is a hundred lines describing how this page stays fast with a
 * hundred thousand members. Nothing in the app imported it. The whole file was
 * documentation of optimisations nobody had applied — including the one its own
 * text calls "the single largest win available on this screen and it costs one
 * function".
 *
 * Two of its rules are checkable from source, and both were being broken:
 *
 *   getItemType   with none, FlashList has ONE row type, so a ballot's tree —
 *                 six posters, six boxes — is torn down and a take's single
 *                 sentence built in its place, on a scroll frame, both ways.
 *
 *   recyclingKey  without it a reused <Image> keeps the previous row's bitmap
 *                 mounted while the new uri decodes, so the row shows the wrong
 *                 picture for a frame. The avatar in the byline had none, and
 *                 the byline is in every single row.
 *
 * Scoped deliberately to what the FEED recycles. A sheet that opens once does
 * not need a recycling key, and demanding one everywhere is how a rule stops
 * meaning anything.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', p), 'utf8');

const FEED = read('app/(tabs)/dispatch.tsx');
/**
 * The one component the feed's renderItem mounts per filing, with its comments
 * removed.
 *
 * Stripped because the first draft of the image scan below counted the literal
 * `<Image>` inside a JSX comment EXPLAINING the recycling key, and reported the
 * component as missing one. This project has a standing rule about it and I
 * broke it inside the test written to enforce a different rule.
 */
const ROW = read('src/components/dispatch/paper/PaperPost.tsx')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*$/gm, '');

describe('the feed row can actually be recycled', () => {
  it('read the files', () => {
    expect(FEED.length).toBeGreaterThan(2000);
    expect(ROW.length).toBeGreaterThan(2000);
  });

  it('the list is told what kind each row is', () => {
    // Both halves: the prop reaches FlashList, and it is derived from the shared
    // helper rather than a second opinion written inline.
    expect(FEED).toMatch(/getItemType=\{/);
    expect(FEED).toMatch(/from '@\/src\/components\/dispatch\/paper\/paperPerf'/);
    expect(FEED).toMatch(/itemType\(\{/);
  });

  it('the row type separates the things that are different TREES', () => {
    // Kind alone is not enough: a filing with film art is a different tree from
    // one without, and an ended filing is a tombstone rather than a post.
    const call = FEED.slice(FEED.indexOf('itemType({'), FEED.indexOf('itemType({') + 260);
    expect(call).toMatch(/kind:/);
    expect(call).toMatch(/still:/);
    expect(call).toMatch(/removed:/);
  });

  it('every image in the recycled row carries a recycling key', () => {
    // Walked with depth, not matched to the next `>` — a prop like
    // `style={[a, b]}` and an arrow function both contain characters that end a
    // lazy match early, and this project has twice had a scan report working
    // code as broken for exactly that reason.
    const tags: string[] = [];
    let i = 0;
    while ((i = ROW.indexOf('<Image', i)) !== -1) {
      let j = i + 6;
      let brace = 0, paren = 0, bracket = 0;
      let quote: string | null = null;
      for (; j < ROW.length; j++) {
        const ch = ROW[j];
        if (quote) { if (ch === quote && ROW[j - 1] !== '\\') quote = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') brace++; else if (ch === '}') brace--;
        else if (ch === '(') paren++; else if (ch === ')') paren--;
        else if (ch === '[') bracket++; else if (ch === ']') bracket--;
        else if (ch === '>' && !brace && !paren && !bracket) break;
      }
      tags.push(ROW.slice(i, j + 1));
      i = j + 1;
    }

    // The scan found the images at all — three of them, or this proves nothing.
    expect(tags.length).toBeGreaterThanOrEqual(3);

    const bare = tags
      .map((t, n) => ({ t, n }))
      .filter(({ t }) => !/recyclingKey=/.test(t))
      .map(({ n }) => 'image #' + (n + 1));
    expect(bare).toEqual([]);
  });
});

describe('paperPerf is wired, all of it', () => {
  /**
   * This module has now been caught unwired TWICE — once entirely, and once with
   * two exports left dead after the rest was connected. `LEAD_STYLE` sat unused
   * while eight sites built the very object it exists to replace, one of them in
   * the feed row itself; `PREFETCH_ROWS` sat under a section that never asked
   * for prefetching and has been removed.
   *
   * So the guard is not "is paperPerf imported" — it was, and two exports were
   * still dead. It is: EVERY export earns its place, or it should not be there.
   */
  const DIR = path.join(__dirname, '..', 'paper');
  const perfSrc = fs.readFileSync(path.join(DIR, 'paperPerf.ts'), 'utf8');
  const names = [...perfSrc.matchAll(/export const (\w+)/g)].map((m) => m[1]);

  /**
   * Every SHIPPING source file except the one that defines them.
   *
   * Two exclusions, and the first draft got both wrong in the same run:
   *   · the definition itself, or every export looks used — by itself;
   *   · `__tests__`, because a test importing something does not make it wired.
   *     `itemType` is imported by the feed AND by this file; if only this file
   *     imported it, it would still be dead in the app. Excluding tests also
   *     stops THIS test's own words from counting as usage, which is what made
   *     the vacuity check below fire the first time it ran.
   */
  const corpus = (() => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); continue; }
        if (!/\.tsx?$/.test(e.name) || e.name === 'paperPerf.ts') continue;
        out.push(fs.readFileSync(full, 'utf8'));
      }
    };
    walk(path.join(__dirname, '..', '..', '..'));
    walk(path.join(__dirname, '..', '..', '..', '..', 'app'));
    return out.join('\n');
  })();

  it('found the exports and a corpus to look in', () => {
    expect(names.length).toBeGreaterThan(1);
    expect(corpus.length).toBeGreaterThan(100_000);
    // The corpus must genuinely exclude the definitions, or the next test
    // passes vacuously — every name would match its own `export const` line.
    // Built by concatenation so this assertion is not itself a match.
    for (const n of names) expect(corpus).not.toContain('export const ' + n);
  });

  it('has no export that nothing imports', () => {
    const dead = names.filter((n) => !new RegExp('\\b' + n + '\\b').test(corpus));
    expect(dead).toEqual([]);
  });

  it('names no database function the app does not call', () => {
    /**
     * ── THE FOURTH WRONG SENTENCE IN THIS FILE ───────────────────────────────
     * paperPerf said the feed's page is "joined server-side by
     * `get_dispatch_paper`". Probed against production: 404, PGRST202, and
     * nothing in the app has ever called an RPC by that name.
     *
     * The CLAIM was true — `FILING_CARD_COLUMNS` ends with an embedded
     * `profiles!…_fkey(…)`, so PostgREST does the join and one request returns
     * the page — but a sentence naming a function that does not exist is how
     * somebody ends up hunting for it, or writing it.
     *
     * So: any `snake_case` identifier in these files that LOOKS like a database
     * function must be one the app actually calls. Checked against the real
     * `supabase.rpc(...)` call sites, so this cannot be satisfied by adding the
     * name to a list.
     */
    const called = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/g)) called.add(m[1]);
      }
    };
    walk(path.join(__dirname, '..', '..', '..'));
    walk(path.join(__dirname, '..', '..', '..', '..', 'app'));

    // The probe must be able to say no: the app does call at least one.
    expect(called.size).toBeGreaterThan(0);

    /** Verb-shaped snake_case in backticks — how this file names a function. */
    const phantom: string[] = [];
    for (const f of fs.readdirSync(DIR).filter((n) => /\.tsx?$/.test(n))) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const m of src.matchAll(/`((?:get|set|end|add|is|has|make|fetch|grant|revoke)_[a-z0-9_]+)`/g)) {
        if (!called.has(m[1])) phantom.push(`${f}: \`${m[1]}\``);
      }
    }
    expect(phantom).toEqual([]);
  });

  describe('Android font padding, which the harness can never see', () => {
    /**
     * The web render harness has no Android font padding, so no screenshot and
     * no layout audit in this repo can catch this — it is only checkable from
     * the source, which is why it is here rather than measured.
     *
     * The rule is per-FACE, and that is the finding. It had been applied to 48
     * of the 54 styles in the label face and to NONE of the 22 reading styles.
     * Six labels were missed, `leadIn` among them — the `TAKE — ` printed inline
     * on a feed row, where its padding sets the row's first line height.
     */
    const styles = (() => {
      const src = fs.readFileSync(path.join(DIR, 'paperStyles.ts'), 'utf8');
      const pad = (s: string) => s.replace(/[^\n]/g, ' ');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, pad).replace(/\/\/[^\n]*/g, pad);
      const out: { name: string; body: string }[] = [];
      const re = /^ {2}([A-Za-z_]\w*):\s*\{/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        let i = m.index + m[0].length - 1; let depth = 0; let j = i;
        for (; j < code.length; j++) {
          if (code[j] === '{') depth++;
          else if (code[j] === '}') { depth--; if (!depth) break; }
        }
        out.push({ name: m[1], body: code.slice(i, j + 1) });
      }
      return out.filter((e) => /\bfontSize\s*:/.test(e.body));
    })();

    const faceOf = (b: string) => (b.match(/fontFamily:\s*fonts\.(\w+)/) ?? [, '(none)'])[1];

    it('parsed the sheet, and found both kinds of style in it', () => {
      expect(styles.length).toBeGreaterThan(60);
      expect(styles.filter((s) => faceOf(s.body) === 'sub').length).toBeGreaterThan(40);
      expect(styles.filter((s) => faceOf(s.body) !== 'sub').length).toBeGreaterThan(15);
    });

    it('every style in the LABEL face kills it', () => {
      const bare = styles
        .filter((s) => faceOf(s.body) === 'sub' && !/includeFontPadding/.test(s.body))
        .map((s) => s.name);
      expect(bare).toEqual([]);
    });

    it('and no READING face does, because this app renders Arabic', () => {
      // Not an oversight to be tidied up later: stripping the padding from
      // multi-line serif or display text is how tall glyphs clip on Android,
      // and there is no Android device here to prove otherwise on.
      const stripped = styles
        .filter((s) => faceOf(s.body) !== 'sub' && /includeFontPadding/.test(s.body))
        .map((s) => s.name);
      expect(stripped).toEqual([]);
    });
  });

  it('and no row builds the per-kind style LEAD_STYLE exists to replace', () => {
    // `{ color: KIND_RULE[kind] }` written inline is a fresh object per render.
    // The frozen constants are one per kind for the life of the process.
    const offenders: string[] = [];
    for (const f of fs.readdirSync(DIR).filter((n) => /\.tsx$/.test(n))) {
      const code = fs.readFileSync(path.join(DIR, f), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      for (const m of code.matchAll(/\{\s*color:\s*KIND_RULE[.[][\w.\]]*\s*\}/g)) {
        // The one legitimate form: a lookup with a fallback for a kind that is
        // not one of the five, which a frozen record cannot express.
        if (/\?\?/.test(code.slice(m.index, m.index! + 90))) continue;
        offenders.push(f + ': ' + m[0].replace(/\s+/g, ' '));
      }
    }
    expect(offenders).toEqual([]);
  });
});
