/**
 * dossierPublishing.guard.test.ts — batch 21
 * ──────────────────────────────────────────
 * Three defects, and the one that hurts is not the one the finding names.
 *
 *   #122  `sanitizeInput` truncates with NO signal in its return type, the essay
 *         body had no length cap in the editor, and the draft is deleted AFTER a
 *         publish that reports success. So an over-length essay was silently
 *         shortened and the writer's draft destroyed on the strength of that.
 *   #60   the offline path omitted the row id, so the local and server rows were
 *         two different dossiers — and a retried mutation made ANOTHER one.
 *   #12   the zip guard failed closed only when EVERY entry was unmeasurable.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAX_LENGTHS, isOverLimit, remainingChars, sanitizeInput } from '../sanitizeInput';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('#122 · an over-length essay is refused, never silently cut', () => {
  const compose = stripComments(read('app/dispatch/compose.tsx'));

  it('the composer uses the limit helpers that shipped with zero callers', () => {
    expect(compose).toMatch(/isOverLimit/);
    expect(compose).toMatch(/remainingChars/);
  });

  it('publishing is refused BEFORE anything is written or deleted', () => {
    // The guard must sit above the try block: the draft deletion lives inside it,
    // after the publish resolves. Returning early is what keeps every word.
    const publish = compose.slice(compose.indexOf('const handlePublish'));
    const guard = publish.indexOf('limit.over');
    const tryAt = publish.indexOf('try {');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(tryAt);
  });

  it('the writer is told BY HOW MUCH, not just refused', () => {
    expect(compose).toMatch(/limit\.remaining/);
  });

  it('the counter appears only near the fence, not from the first sentence', () => {
    expect(compose).toMatch(/remaining <= LIMIT_WARNING_CHARS/);
  });
});

describe('#122 · the fence itself does not move', () => {
  it('the write cap is still the render cap', () => {
    // These are ONE number by design. Raising the write cap raises what the
    // markdown parser may be handed, and two of its rules are quadratic —
    // measured at 6877ms for 80k of nested emphasis. It was raised to 60000
    // during this batch and put back for exactly that reason.
    expect(MAX_LENGTHS.dossierContent).toBe(25000);
    const render = stripComments(read('src/utils/markdownSafety.ts'));
    expect(render).toMatch(/content\.length <= MAX_LENGTHS\.dossierContent/);
  });

  it('the helpers agree with the cap', () => {
    const under = 'x'.repeat(MAX_LENGTHS.dossierContent);
    const over = 'x'.repeat(MAX_LENGTHS.dossierContent + 1);
    expect(isOverLimit(under, 'dossierContent')).toBe(false);
    expect(isOverLimit(over, 'dossierContent')).toBe(true);
    expect(remainingChars(over, 'dossierContent')).toBe(-1);
  });

  it('the helpers measure what is STORED, not what was typed', () => {
    // sanitizeInput CLEANS before it caps — invisible characters go, runs of
    // blank lines and spaces collapse. The helpers used to measure the raw
    // string, so the composer could refuse an essay that would have fitted.
    // Never the other way round (cleaning only shortens), so nothing was ever
    // at risk — but a writer told to trim when they needn't is the app lying.
    const max = MAX_LENGTHS.dossierContent;
    const body = 'x'.repeat(max - 10);
    // 40 blank lines collapse to three; raw length is over, stored length is not.
    const withPadding = body + '\n'.repeat(40);
    expect(withPadding.length).toBeGreaterThan(max);
    expect(isOverLimit(withPadding, 'dossierContent')).toBe(false);
    expect(sanitizeInput(withPadding, 'dossierContent').length).toBeLessThanOrEqual(max);

    // And the two agree exactly: whatever the helper says is left is what the
    // sanitiser will keep.
    const stored = sanitizeInput(withPadding, 'dossierContent');
    expect(remainingChars(withPadding, 'dossierContent')).toBe(max - stored.length);
  });
});

describe('#60 · one dossier, however the network behaved', () => {
  const exec = stripComments(read('src/utils/mutationExecutor.ts'));

  it('the offline insert carries the SAME id the optimistic row already has', () => {
    const addDossier = exec.slice(exec.indexOf('add_dossier: async'), exec.indexOf('update_dossier: async'));
    expect(addDossier).toMatch(/id: p\._tempId/);
  });

  it('which also makes a retry idempotent, not duplicating', () => {
    // A transient failure retries this up to five times. Without an id every
    // attempt minted a new row; with it, the retry hits the unique key and the
    // queue's duplicate branch drops it as already-written.
    const queue = stripComments(read('src/utils/offlineQueue.ts'));
    expect(queue).toMatch(/errorClass === 'duplicate'/);
  });
});

describe('#12 · the zip guard fails closed on ANY unmeasurable entry', () => {
  const imp = stripComments(read('src/features/archive/archiveImport.ts'));

  it('no longer requires that EVERY entry be unmeasurable', () => {
    // One measurable entry alongside 1,999 unmeasurable ones used to pass both
    // caps, and those 1,999 then decompress unbounded.
    expect(imp).not.toMatch(/unmeasurable > 0 && totalUncompressed === 0/);
    expect(imp).toMatch(/if \(unmeasurable > 0\) \{/);
  });
});

/**
 * The same two guarantees, at the addresses they moved to.
 *
 * The dossier feed became the Dispatch feed, `content.ts` became `dispatch.ts`,
 * and `ArticleReaderModal` became `app/dispatch/[id].tsx`. Neither guarantee
 * stopped mattering — an essay is still 25,000 characters that a card renders
 * 500 of, and a body still has to land on the store row rather than in a
 * component that will discard it on the next render.
 */
describe('the Dispatch feed stops carrying essay bodies', () => {
  const types = stripComments(read('src/stores/dispatchTypes.ts'));
  const store = stripComments(read('src/stores/dispatch.ts'));

  it('the card columns do not include the essay', () => {
    // Asking for full_content on a twenty-row page is 83% payload nobody draws.
    // The columns are named explicitly, so this reads the list rather than
    // trusting a comment about it.
    const cards = types.slice(
      types.indexOf('FILING_CARD_COLUMNS'),
      types.indexOf('FILING_FULL_COLUMNS'),
    );
    expect(cards.length).toBeGreaterThan(100);
    expect(cards).not.toMatch(/full_content/);
  });

  it('and the reader asks for it separately, once', () => {
    expect(types).toMatch(/FILING_FULL_COLUMNS[\s\S]{0,200}full_content/);
    expect(store).toMatch(/FILING_FULL_COLUMNS/);
  });

  it('the body lands on the STORE row, not in the reader component', () => {
    // The reader renders the store's copy — `filings.find(...) ?? filing` — so a
    // body held only in component state would be discarded on the next render
    // and the essay would quietly become its 500-character opening.
    // Anchored on the IMPLEMENTATION, not on `hydrate:` — the first match for
    // that is the type declaration in the interface, and a slice starting there
    // measures a signature rather than a body. It would then fail (as it did)
    // or, worse, pass because some unrelated code happened to fall inside it.
    const start = store.indexOf('hydrate: async (id)');
    expect(start).toBeGreaterThan(-1);
    const hydrate = store.slice(start, store.indexOf('file: async (draft)'));
    expect(hydrate).toMatch(/set\(\(st\)/);

    const reader = stripComments(read('app/dispatch/[id].tsx'));
    expect(reader).toMatch(/hydrate\(id\)/);
    expect(reader).toMatch(/filings\.find\(/);
  });
});
