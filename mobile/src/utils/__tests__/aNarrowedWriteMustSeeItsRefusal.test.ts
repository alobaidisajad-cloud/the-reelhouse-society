/**
 * aNarrowedWriteMustSeeItsRefusal.test.ts — 200 OK, nothing changed.
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgREST answers a write whose predicate or RLS policy matches no row with
 * 200 and an empty body. `error` is null. So a REFUSED write is
 * indistinguishable from one that worked, unless the call asks for the rows
 * back with `.select(...)`.
 *
 * Three operations drew a conclusion from that silence and told the member
 * something untrue — leaveLounge, deleteLounge, removeCritique — and were fixed.
 * But the class was closed by JUDGEMENT: 58 narrowed writes exist, three were
 * repaired, and the rest were dismissed from a listing without a gate. The next
 * one added would have been caught by nobody, which is fixing the instance and
 * not the class — the exact habit that produced three of them.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * A write narrowed by `.eq(` must either ask for its rows back, or appear below
 * with the reason it does not need to. Nothing is exempt by being unnoticed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/** Blank comments IN PLACE so every offset still maps to the real file. */
const blank = (src: string): string => {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; } continue; }
    if (c === '/' && d === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i += 1; }
      out += '  '; i += 2; continue;
    }
    out += c; i += 1;
  }
  return out;
};

/**
 * Files whose narrowed writes do NOT need to see a refusal, each with why.
 * A file listed here that has NO such writes any more is stale, and the last
 * test says so — the list cannot quietly outlive its reasons.
 */
const EXEMPT: Record<string, string> = {
  'src/utils/mutationExecutor.ts':
    'The offline replay layer. `throwIfRefused` is used in the three Dispatch ' +
    'replays where a refusal is MEANINGFUL — an amendment against a filing the ' +
    'house withheld while the member was offline. Everywhere else a queued ' +
    'mutation matching no row means it has already been applied, and treating ' +
    'that as failure would retry it for ever. Deliberate, and documented at ' +
    'throwIfRefused itself.',

  'src/stores/dispatch.ts':
    'Certification and save TOGGLES. Deleting a mark that is already absent is ' +
    'the idempotent half of a toggle, not a refusal, and `writeThrough` carries ' +
    'an explicit rollback for the failures that do matter.',

  'src/stores/blockStore.ts':
    'Block and mute toggles. Removing a block that is already gone is the ' +
    'ordinary outcome of tapping twice.',

  'src/stores/domain/watchlistSlice.ts':
    'Watchlist toggle — same shape: removing what is not there is success.',

  'src/stores/domain/archiveSlice.ts':
    'Physical-archive toggle and its edit, both scoped to the member by ' +
    'user_id + film_id, where an absent row is the idempotent outcome.',

  'src/stores/domain/listSlice.ts':
    'Stack membership and teardown. Removing films from a list, and deleting a ' +
    'list the member owns, are idempotent — and the multi-step teardown would ' +
    'be made WORSE by failing partway on an already-clean table.',

  'src/stores/domain/socialSlice.ts':
    'Unfollow, which is a toggle: the interaction row being absent is what ' +
    'unfollowed already means.',

  'src/stores/lounge.ts':
    'The reaction toggle, and markRead. Un-reacting an absent reaction is ' +
    'idempotent; a read-mark that does not land is corrected by the next ' +
    'fetch and is not worth a rollback.',

  'src/stores/notificationStore.ts':
    'Read-marks and dismissals, all narrowed by user_id. A notice already read ' +
    'or already dismissed matches nothing, which is the same end state.',

  'src/services/InteractionService.ts':
    'removeEndorsement — a toggle, and it throws on a real error.',

  'src/services/ModerationService.ts':
    'Unblock, a toggle, and it throws on a real error.',

  'src/services/LogService.ts':
    'Removing a comment the member owns; absent means already removed.',

  'src/stores/domain/logSlice/helpers/logOperations.ts':
    'Log edits and deletes, narrowed by user_id. The edit path enqueues on a ' +
    'network error and announces only on success; an absent row is a log ' +
    'already gone.',

  'src/services/ProfileWriteService.ts':
    'The profile UPDATE is addressed by the signed-in member own id and is ' +
    'followed by a read that would surface any divergence.',

  'src/stores/auth.ts':
    'The signup-time profile write, against a row the trigger has just created ' +
    'for this member.',

  'src/utils/draftSync.ts':
    'dropDraft. It now READS its error and logs a refusal; it is deliberately ' +
    'not retried, because whichCopy compares timestamps rather than trusting ' +
    'the backup existence.',
};

const narrowedWritesWithoutSelect = (): { file: string; line: number }[] => {
  const files = execFileSync('git', ['ls-files', 'src', 'app'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\./.test(f));

  const out: { file: string; line: number }[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const src = blank(raw);
    for (const verb of ['delete', 'update']) {
      const re = new RegExp(`\\.${verb}\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const tail = src.slice(m.index, m.index + 800);
        let depth = 0;
        let end = tail.length;
        for (let i = 0; i < tail.length; i += 1) {
          const c = tail[i];
          if ('([{'.includes(c)) depth += 1;
          else if (')]}'.includes(c)) depth -= 1;
          else if (c === ';' && depth <= 0) { end = i; break; }
        }
        const chain = tail.slice(0, end);
        if (!/\.eq\(/.test(chain)) continue;              // bulk write: no row is ordinary
        if (/\.select\(|\.single\(|\.maybeSingle\(/.test(chain)) continue;
        out.push({ file: f, line: raw.slice(0, m.index).split('\n').length });
      }
    }
  }
  return out;
};

describe('a narrowed write can tell refusal from success', () => {
  it('finds narrowed writes at all — not passing on an empty sweep', () => {
    expect(narrowedWritesWithoutSelect().length).toBeGreaterThan(20);
  });

  it('EVERY one is either selecting its rows back, or exempted with a reason', () => {
    const unaccounted = narrowedWritesWithoutSelect()
      .filter((w) => !(w.file in EXEMPT))
      .map((w) => `${w.file}:${w.line}`);
    expect(unaccounted).toEqual([]);
  });

  it('the three that LIED to the member all ask for their rows back', () => {
    const lounge = fs.readFileSync(path.join(ROOT, 'src/stores/lounge.ts'), 'utf8');
    const dispatch = fs.readFileSync(path.join(ROOT, 'src/stores/dispatch.ts'), 'utf8');

    // leaveLounge, deleteLounge, removeCritique.
    expect(lounge).toMatch(/\.eq\('user_id', user\.id\)\s*\.select\('id'\)/);
    expect(lounge).toMatch(/\.eq\('creator_id', user\.id\)\s*\.select\('id'\)/);
    expect(dispatch).toMatch(/from\('dispatch_comments'\)[\s\S]{0,200}?\.select\('id'\)/);
  });

  it('every exemption still HAS such a write — the list cannot rot', () => {
    const live = new Set(narrowedWritesWithoutSelect().map((w) => w.file));
    const stale = Object.keys(EXEMPT).filter((f) => !live.has(f));
    expect(stale).toEqual([]);
  });
});
