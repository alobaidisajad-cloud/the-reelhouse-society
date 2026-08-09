/**
 * tribunalNeverLiesEmpty.guard.test.ts — batch 26 · #24
 * ─────────────────────────────────────────────────────
 * The urgent queue called an RPC signature that does not exist, so the query
 * failed on every attempt. Neither queue query reported errors, so the failure
 * rendered as an empty list and the screen said:
 *
 *     "The docket is clear. The house rests."
 *
 * A moderator was told there was nothing to review when nothing had loaded.
 *
 * A queue is the one screen where "nothing here" has to be trustworthy, which is
 * why this pins the CLASS — both queues — and not just the tab that was broken.
 */
import * as fs from 'fs';
import * as path from 'path';

const screen = fs.readFileSync(
  path.join(__dirname, '..', 'tribunal.tsx'),
  'utf8',
);
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = strip(screen);

describe('#24 · a docket that failed can never render as a docket that is clear', () => {
  it('EVERY queue query reports failure — enumerated, not spot-checked', () => {
    // Three useQuery calls live here and none reported errors. Fixing only the
    // urgent one would have left the MAIN docket a single bad request away from
    // the same lie — it simply had not failed yet.
    const queries = [...code.matchAll(/const \{([\s\S]*?)\} = useQuery\(\{([\s\S]*?)queryKey: (\[[^\]]*\])/g)];
    expect(queries.length).toBeGreaterThanOrEqual(3);

    const unreported = queries
      .filter(([, destructured, , key]) => {
        // Moderation history is context beside a report, not the verdict, and
        // this file already treats that class as best-effort. Exempt by name so
        // the exemption is a decision rather than an omission.
        if (/moderation-history/.test(key)) return false;
        return !/isError/.test(destructured);
      })
      .map(([, , , key]) => key);

    expect(unreported).toEqual([]);
  });

  it('the failure branch is checked BEFORE the empty branch', () => {
    // An empty list and an unanswered question look identical from the render's
    // point of view. If the empty check came first it would always win.
    const failIdx = code.indexOf('queueFailed ?');
    const emptyIdx = code.indexOf('displayData.length === 0 ?');
    expect(failIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeLessThan(emptyIdx);
  });

  it('it follows the visible tab, so neither queue can lie', () => {
    expect(code).toMatch(/const queueFailed = activeView === 'pending' \? pendingFailed : priorityFailed;/);
    expect(code).toMatch(/const retryQueue = activeView === 'pending' \? refetch : refetchPriority;/);
  });

  it('says plainly that nothing loaded, and offers a way back', () => {
    // "Failed to load" invites the reading that the queue is fine and the screen
    // is fussy. The wording has to close that door.
    expect(screen).toMatch(/The docket could not be reached\./);
    expect(screen).toMatch(/This is not an empty queue/);
    expect(code).toMatch(/onPress=\{\(\) => \{ void retryQueue\(\); \}\}/);
  });

  it('the honest empty state still exists for a genuinely clear docket', () => {
    // The point is to stop it LYING, not to remove it.
    expect(screen).toMatch(/The docket is clear\. The house rests\./);
  });
});

describe('#24 · the client keyset still matches the RPC ordering', () => {
  it('pages from the LAST row in server order, carrying all three keys', () => {
    // The compound cursor is only correct if it is built from the row the server
    // ordered last, and the list is never re-sorted before that read. A perfect
    // keyset paged from the wrong row still skips reports — and a skipped page
    // here is an unreviewed report.
    expect(code).toMatch(/const last = priorityItems\[priorityItems\.length - 1\];/);
    expect(code).toMatch(/report_count: Number\(last\.report_count/);
    expect(code).toMatch(/created_at: last\.created_at/);
    expect(code).toMatch(/id: last\.id/);
    // Nothing may re-order the accumulated list, or `last` stops meaning last.
    expect(code).not.toMatch(/priorityItems[\s\S]{0,40}\.sort\(/);
  });
});
