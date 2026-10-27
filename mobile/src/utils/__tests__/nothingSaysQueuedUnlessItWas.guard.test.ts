/**
 * Nothing says a write was saved or queued unless the phone kept it (P4.14).
 *
 * enqueueMutation keeps a write to send when the network returns. With no room left on the phone
 * it could not, and said nothing: every caller went on to "saved offline. Will sync when
 * connected." over a write that was gone. Now it returns whether the write was kept, tells the
 * member itself when it was not (NOT_KEPT), and a caller claims nothing unless it was. A finder
 * over the syntax tree fails on any bare enqueueMutation(...) statement followed in its block by
 * a claim: a toast that is not an error, `offline: true`, or `queuedOffline = true`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';
import { enqueueMutation, getOfflineQueue } from '../offlineQueue';
import { NOT_KEPT } from '../queueOwnership';
import { storage } from '@/src/stores/mmkv-storage';
import reelToast from '../reelToast';

jest.mock('../reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) } }));

const ROOT = join(__dirname, '..', '..', '..');

/** A statement that tells the member, or its caller, the write is kept. */
function claims(text: string): boolean {
  const toast = /reelToast(?:\.success|\.info)?\(/.test(text) && !/^\s*reelToast\.error\(/.test(text);
  return toast || /offline:\s*true/.test(text) || /queuedOffline\s*=\s*true/.test(text);
}

/** Each bare enqueueMutation statement followed in its block by a claim, as file:line. */
export function claimsUnkept(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isCaseClause(n)) {
      n.statements.forEach((s, i) => {
        const bare = ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.expression.getText(sf) === 'enqueueMutation';
        if (bare && n.statements.slice(i + 1).some((t) => claims(t.getText(sf)))) {
          out.push(`${file}:${sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1}`);
        }
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const callers = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }))
  .filter(({ text }) => text.includes('enqueueMutation('));

describe('a write the phone could not keep', () => {
  it('is claimed nowhere: every claim of saving waits on enqueueMutation\'s answer', () => {
    expect(callers.length).toBeGreaterThanOrEqual(15);
    expect(callers.flatMap(({ f, text }) => claimsUnkept(f, text))).toEqual([]);
  });

  it('says NO to a claim after a bare call, and yes to one that waits', () => {
    const probe = (body: string) => claimsUnkept('probe.ts', `function f() { ${body} }`);
    expect(probe("enqueueMutation(m); reelToast('Saved offline.'); return;")).toEqual(['probe.ts:1']);
    expect(probe('enqueueMutation(m); return { offline: true };')).toEqual(['probe.ts:1']);
    expect(probe("if (enqueueMutation(m)) { reelToast('Saved offline.'); }")).toEqual([]);
    expect(probe("enqueueMutation(m); reelToast.error('Not sent.');")).toEqual([]);
  });

  it('is told to the member, kept nowhere, and answered false', () => {
    (storage.set as jest.Mock).mockImplementationOnce(() => { throw new Error('No space left on device'); });
    const kept = enqueueMutation({ type: 'add_critique', payload: { _tempId: 't', post_id: 'p', user_id: 'u', body: 'b' } });
    expect([kept, getOfflineQueue().length]).toEqual([false, 0]);
    expect(reelToast.error).toHaveBeenCalledWith(NOT_KEPT);
  });

  it('a write kept is answered true, and nothing is said of room', () => {
    jest.clearAllMocks();
    expect(enqueueMutation({ type: 'add_critique', payload: { _tempId: 't2', post_id: 'p', user_id: 'u', body: 'b' } })).toBe(true);
    expect(reelToast.error).not.toHaveBeenCalled();
  });
});
