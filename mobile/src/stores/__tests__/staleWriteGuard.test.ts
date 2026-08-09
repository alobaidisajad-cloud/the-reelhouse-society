/**
 * staleWriteGuard.test.ts — batch 23
 * ──────────────────────────────────
 * Every async store operation reads the member at its start, awaits the network,
 * then writes. None re-checked in between, so a logout during that await let the
 * previous member's data land in a store the reset had already cleared — and a
 * store change triggers a disk write, so it also re-created the persisted copy
 * that #64 deletes.
 *
 * This is an ENUMERATION, not a list of the sites I happened to notice. It walks
 * the slices, finds every operation that writes after awaiting, and demands a
 * guard. A new operation of that shape fails this the day it is written.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');

const SLICES = [
  'src/stores/domain/logSlice/helpers/logOperations.ts',
  'src/stores/domain/watchlistSlice.ts',
  'src/stores/domain/listSlice.ts',
  'src/stores/domain/archiveSlice.ts',
  'src/stores/domain/interactionSlice.ts',
  'src/stores/domain/socialSlice.ts',
  // The film store was where #64 was filed, but the defect belongs to any store
  // a logout clears. notificationStore is the sharpest case outside it: it
  // PERSISTS, and its reset deletes that file to stop a documented "cross-user
  // notification leak" — so a late write rewrites the very key the defence
  // removes. The defence and the defect were in the same file.
  'src/stores/notificationStore.ts',
];

/**
 * Stores with the same shape, NOT yet guarded — recorded rather than omitted, so
 * the gap is visible instead of forgotten.
 *
 * All three are memory-only (they do not persist), so a late write shows the
 * previous member's data until the next fetch replaces it, rather than writing
 * it to disk. That is why they rank below notificationStore and why they are a
 * scope decision rather than something to fold in silently.
 *
 * blockStore additionally keeps a per-member MMKV cache, so it should be first
 * when this is picked up.
 */
const KNOWN_UNGUARDED: Record<string, number> = {
  'src/stores/blockStore.ts': 5,
  'src/stores/lounge.ts': 12,
  'src/stores/content.ts': 6,
};

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

type Op = { file: string; name: string; line: number };

function opsWritingAfterAwait(file: string): Op[] {
  const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const lines = src.split(/\r?\n/);

  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s{0,4}(export const )?\w+:?\s*(=\s*)?async\s*\(/.test(l)) starts.push(i);
  });

  const out: Op[] = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const body = lines.slice(start, end);

    let sawAwait = false;
    let writesAfterAwait = false;
    for (const l of body) {
      if (/\bawait\b/.test(l)) sawAwait = true;
      if (sawAwait && /(^|[^.\w])set\(/.test(l) && !/getState|useAuthStore/.test(l)) {
        writesAfterAwait = true;
        break;
      }
    }
    if (!writesAfterAwait) continue;

    // Guarded if the operation consults the captured member anywhere in its body.
    if (body.some((l) => /stillSignedIn\(/.test(l))) continue;

    out.push({ file, name: lines[start].trim().slice(0, 70), line: start + 1 });
  }
  return out;
}

describe('a write that lands after logout must not repopulate the store', () => {
  it('EVERY operation that writes after awaiting is guarded — enumerated', () => {
    const unguarded = SLICES.flatMap(opsWritingAfterAwait)
      .map((o) => `${o.file}:${o.line}  ${o.name}`);
    expect(unguarded).toEqual([]);
  });

  it('the detector actually finds operations — it is not passing on an empty set', () => {
    // A sweep that matches nothing passes silently. This pins that the walker
    // still recognises the shape it is meant to police.
    const src = stripComments(
      fs.readFileSync(path.join(ROOT, 'src/stores/domain/logSlice/helpers/logOperations.ts'), 'utf8')
    );
    expect((src.match(/stillSignedIn\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('the unguarded stores have not grown — the gap is pinned, not forgotten', () => {
    // If one of these gets worse, this fails and says so. If one gets FIXED, it
    // also fails — prompting the entry to be removed and the file promoted into
    // SLICES above. Either direction is a deliberate decision rather than drift.
    const actual: Record<string, number> = {};
    for (const file of Object.keys(KNOWN_UNGUARDED)) {
      actual[file] = opsWritingAfterAwait(file).length;
    }
    expect(actual).toEqual(KNOWN_UNGUARDED);
  });

  it('the guard compares against a CAPTURED id, never the current one', () => {
    // `stillSignedIn(useAuthStore.getState().user?.id)` compares the current
    // member to themselves and is always true — a guard that cannot fail. I
    // wrote exactly that once while building this; the id must be captured
    // before the await.
    for (const file of SLICES) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      expect(src).not.toMatch(/stillSignedIn\(\s*useAuthStore\.getState\(\)/);
    }
  });
});
