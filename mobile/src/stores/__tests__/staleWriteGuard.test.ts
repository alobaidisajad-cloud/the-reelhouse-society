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
  // All eight stores that register a logout reset are now covered. These three
  // were pinned as a known gap for one round and then closed; the pin fired when
  // they were fixed, which is what promoted them here.
  'src/stores/blockStore.ts',
  'src/stores/lounge.ts',
  'src/stores/content.ts',
];

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

type Op = { file: string; name: string; line: number };

function opsWritingAfterAwait(file: string): Op[] {
  const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const lines = src.split(/\r?\n/);

  // Boundaries include NON-async members too. They were async-only at first, so
  // an async op followed by a sync one had no end — its body ran on into the
  // next function and inherited that function's writes. deleteLounge was
  // reported unguarded on exactly that basis, while its own rollback is a
  // refetch that is guarded in its own right.
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s{0,4}(export const )?\w+:?\s*(=\s*)?(async\s*\(|\()/.test(l)) starts.push(i);
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

    // Guarded if the operation consults the captured member anywhere in its
    // body — by EITHER primitive. `stillSignedIn` requires a member and suits
    // the film store, where every operation needs one; `memberUnchanged` also
    // accepts nobody-then-nobody-now, which is what stores reachable by
    // anonymous browsing need. Recognising only the first would have reported
    // eighteen correctly-guarded operations as unguarded.
    if (body.some((l) => /stillSignedIn\(|memberUnchanged\(/.test(l))) continue;

    // A realtime SUBSCRIPTION is exempt, and only this shape is. It has no
    // caller and therefore no member captured at a start to compare against —
    // the guard has nothing to ask. Its equivalent protection is unsubscribing
    // on logout, which the test below asserts actually happens.
    if (/^\s*subscribeTo\w+:/.test(lines[start])) continue;

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

  it('EVERY store that registers a logout reset is covered — no store is exempt', () => {
    // The film store was where #64 was filed, and sweeping only its slices left
    // the identical defect in four other stores. This pins the LIST itself, so
    // adding a store with a reset handler and forgetting to sweep it fails here.
    const resetting = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); continue; }
        if (!/\.ts$/.test(e.name)) continue;
        const src = fs.readFileSync(full, 'utf8');
        if (/registerStoreReset\(/.test(src) && !/export function registerStoreReset/.test(src)) {
          resetting.add(path.relative(ROOT, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(path.join(ROOT, 'src', 'stores'));

    // A store with a reset must either be swept, or hold nothing that writes
    // after an await. Anything else is an unswept store.
    const unswept = [...resetting].filter(
      (f) => !SLICES.includes(f) && opsWritingAfterAwait(f).length > 0
    );
    expect(unswept).toEqual([]);
  });

  it('the exempted subscription is actually torn down on logout', () => {
    // The exemption above is only honest if this holds. The lounge reset used to
    // set `_activeChannel = null` — forgetting the reference while leaving the
    // subscription LIVE — so a message arriving after logout still reached the
    // handler and wrote into the store the reset had just cleared. Nulling a
    // variable is not unsubscribing. notificationStore tears its channel down;
    // this one did not.
    const lounge = stripComments(fs.readFileSync(path.join(ROOT, 'src/stores/lounge.ts'), 'utf8'));
    const reset = lounge.slice(lounge.lastIndexOf('registerStoreReset('));
    expect(reset).toMatch(/supabase\.removeChannel\(_activeChannel\)/);
    expect(reset).toMatch(/_activeChannel = null/);
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
