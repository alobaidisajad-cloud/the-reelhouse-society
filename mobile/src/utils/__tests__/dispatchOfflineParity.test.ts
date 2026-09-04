/**
 * dispatchOfflineParity.test.ts — the offline write must send what the online one does.
 * ─────────────────────────────────────────────────────────────────────────────
 * A filing made with the wire down goes out through a DIFFERENT function from
 * one made with the wire up: the store's `toInsertRow` builds the online row,
 * and `mutationExecutor`'s `add_filing` rebuilds it from the queued payload.
 * Two hand-written field lists that must agree, and nothing checked that they
 * did.
 *
 * The failure is silent and total. Add a column to `toInsertRow` — a spoiler
 * label, a series, a source — and every filing made on a train loses it, with no
 * error anywhere: the insert succeeds, the row is just missing a field. The
 * member sees their filing land and never learns that half of it did not.
 *
 * `dispatchMutationRegistry.test.ts` already holds the four registries a type
 * must appear in. This holds the thing those cannot see: what the handlers
 * actually WRITE.
 *
 * It is the same shape of defect as the comment page size reading 30 while the
 * query asked for 50, and the ballot desk hard-coding its own two-to-six.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const store = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'dispatch.ts'), 'utf8');
const executor = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'mutationExecutor.ts'), 'utf8');

/** The body of a function, from its declaration to the matching close brace. */
function bodyOf(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at === -1) return '';
  let depth = 0;
  let start = -1;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { if (start === -1) start = i; depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

/**
 * Every column name a block writes.
 *
 * Both `key: value` inside an object literal and `row.key = value` after it,
 * because `toInsertRow` uses the second form for everything conditional — which
 * is exactly the half a naive object-literal scan would miss, and the half that
 * grows when somebody adds a field.
 */
function columnsIn(body: string): Set<string> {
  // Comments first: a column named in prose is not a column written.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const out = new Set<string>();
  // Preceded by `{`, `,` or a line start — NOT merely line-leading, which was
  // the first draft and counted one key per line. The handler writes several
  // per line (`subject_kind: …, subject_id: …`), so that version reported
  // fifteen of twenty-two fields as missing and would have failed forever.
  for (const m of code.matchAll(/(?:[{,]|^)\s*([a-z_][a-z0-9_]*)\s*:/gm)) out.add(m[1]);
  // Shorthand, on its own line — `{ id, kind: … }`. `toInsertRow` opens with
  // exactly that, so without this the online side is missing `id` and the
  // handler looks like it invented one.
  for (const m of code.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*,\s*$/gm)) out.add(m[1]);
  for (const m of code.matchAll(/\brow\.([a-z_][a-z0-9_]*)\s*=/g)) out.add(m[1]);
  for (const junk of ['row', 'const', 'if', 'return', 'default', 'catch']) out.delete(junk);
  return out;
}

const insertRow = columnsIn(bodyOf(store, 'function toInsertRow('));
const updateRow = columnsIn(bodyOf(store, 'function toUpdateRow('));
const addFiling = columnsIn(bodyOf(executor, 'add_filing: async'));
const updateFiling = columnsIn(bodyOf(executor, 'update_filing: async'));

describe('the parser found something to compare', () => {
  it('read both sides', () => {
    // A comparison of two empty sets passes and proves nothing — this is the
    // guard on the guard.
    expect(insertRow.size).toBeGreaterThan(15);
    expect(addFiling.size).toBeGreaterThan(15);
    expect(updateRow.size).toBeGreaterThan(4);
    // No floor on `updateFiling`: it forwards the whole `updates` object rather
    // than naming columns, which is the RIGHT shape — naming them would be the
    // second hand-written list this file exists to prevent. The amendment
    // describe block asserts that directly.
  });

  it('found the columns it should have', () => {
    for (const known of ['kind', 'body', 'title', 'full_content', 'series_id', 'spoiler_label']) {
      expect(insertRow.has(known)).toBe(true);
    }
  });
});

describe('a filing made offline carries what one made online carries', () => {
  it('the queued handler writes every column the direct insert writes', () => {
    const missing = [...insertRow].filter((c) => !addFiling.has(c));
    // Each of these is a field that would vanish from any filing made without a
    // connection, silently, with the insert reporting success.
    expect(missing).toEqual([]);
  });

  it('and invents none the direct insert does not', () => {
    // `_tempId` and `_fakeId` are queue bookkeeping and are destructured away
    // before the payload is built, so they must not appear as columns either.
    const extra = [...addFiling].filter((c) => !insertRow.has(c) && !c.startsWith('_'));
    expect(extra).toEqual([]);
  });
});

describe('an amendment made offline carries what one made online carries', () => {
  it('the queued handler writes every column the direct update writes', () => {
    // `update_filing` forwards a whole `updates` object rather than naming each
    // column, so the check is that it does exactly that — naming them would be
    // the second list this test exists to prevent.
    const body = bodyOf(executor, 'update_filing: async');
    const forwardsWhole = /\.\.\.\s*(?:p\.)?updates\b/.test(body) || /\bupdates\b/.test(body);
    expect(forwardsWhole).toBe(true);

    if (!forwardsWhole) {
      const missing = [...updateRow].filter((c) => !updateFiling.has(c));
      expect(missing).toEqual([]);
    }
  });

  it('stamps the edit, as the online path does', () => {
    // The card prints EDITED from `edited_at`. An amendment that lands without
    // it is an edit the page cannot show happened.
    expect(bodyOf(executor, 'update_filing: async')).toMatch(/edited_at/);
  });
});
