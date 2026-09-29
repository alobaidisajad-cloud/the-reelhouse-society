/**
 * The moderation service, act by act, and the one thing the Tribunal must
 * never do: show a record it could not read as a clean one.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import { ModerationService, REPORTS_PAGE_SIZE } from '../ModerationService';
import { EnforcementHistory } from '@/app/(admin)/tribunal';

type Call = { fn: string; args: unknown[] };
/** A PostgREST builder that records every call and answers with `result`. */
function builder(result: Record<string, unknown>, calls: Call[]) {
  const b: Record<string, unknown> = {};
  for (const fn of ['select', 'eq', 'order', 'limit', 'lte', 'in', 'upsert', 'delete']) {
    b[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return b; };
  }
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}

let calls: Call[] = [];
const from = (result: Record<string, unknown>) =>
  jest.spyOn(supabase, 'from').mockImplementation(((table: string) => { calls.push({ fn: 'from', args: [table] }); return builder(result, calls); }) as never);
const rpc = (result: Record<string, unknown>) =>
  jest.spyOn(supabase, 'rpc').mockImplementation(((name: string, params: unknown) => { calls.push({ fn: 'rpc', args: [name, params] }); return Promise.resolve(result); }) as never);
const refused = { data: null, error: { message: 'refused', code: '42501' } };

beforeEach(() => { calls = []; jest.restoreAllMocks(); });

describe('the docket', () => {
  it('reads a page of pending reports, newest first, with the total on the first page', async () => {
    from({ data: [{ id: 'r1' }], error: null, count: 41 });
    const page = await ModerationService.getPendingReports();
    expect(page).toEqual({ rows: [{ id: 'r1' }], total: 41 });
    expect(calls).toContainEqual({ fn: 'eq', args: ['status', 'pending'] });
    expect(calls).toContainEqual({ fn: 'limit', args: [REPORTS_PAGE_SIZE] });
    expect(calls.find((c) => c.fn === 'select')!.args[1]).toEqual({ count: 'exact' });
  });

  it('continues from a cursor without skipping reports at its exact time', async () => {
    from({ data: [], error: null, count: null });
    const page = await ModerationService.getPendingReports('2026-09-01T00:00:00Z');
    expect(calls).toContainEqual({ fn: 'lte', args: ['created_at', '2026-09-01T00:00:00Z'] });
    expect(calls.find((c) => c.fn === 'select')!.args[1]).toBeUndefined();
    expect(page.total).toBeNull();
  });

  it('says a refused read, never an empty docket', async () => {
    from(refused);
    await expect(ModerationService.getPendingReports()).rejects.toMatchObject({ code: '42501' });
    await expect(ModerationService.getPendingCount()).rejects.toMatchObject({ code: '42501' });
  });

  it('counts what waits', async () => {
    from({ data: null, error: null, count: 7 });
    expect(await ModerationService.getPendingCount()).toBe(7);
  });
});

describe('blocks and mutes', () => {
  it('lists, adds (once per pair) and removes', async () => {
    rpc({ data: [{ blocked_id: 'b' }], error: null });
    expect(await ModerationService.getBlockList('me')).toEqual([{ blocked_id: 'b' }]);
    expect(calls).toContainEqual({ fn: 'rpc', args: ['get_user_blocks', { p_user_id: 'me' }] });

    from({ data: null, error: null });
    await ModerationService.insertBlock('me', 'them', 'mute');
    expect(calls).toContainEqual({ fn: 'upsert', args: [{ blocker_id: 'me', blocked_id: 'them', type: 'mute' }, { onConflict: 'blocker_id,blocked_id' }] });

    await ModerationService.removeBlock('me', 'them');
    expect(calls).toContainEqual({ fn: 'eq', args: ['blocked_id', 'them'] });
  });

  it('throws a refusal, so the screen can undo what it showed', async () => {
    rpc(refused);
    await expect(ModerationService.getBlockList('me')).rejects.toBeTruthy();
    from(refused);
    await expect(ModerationService.insertBlock('me', 'them', 'block')).rejects.toBeTruthy();
    await expect(ModerationService.removeBlock('me', 'them')).rejects.toBeTruthy();
  });
});

describe('verdicts', () => {
  it('renders one, with the notice defaulting to sent', async () => {
    rpc({ data: null, error: null });
    await ModerationService.resolveReportV2('r1', 'warn', { admin_id: 'a', reason: 'spam' });
    expect(calls).toContainEqual({ fn: 'rpc', args: ['resolve_moderation_report_v2', {
      p_report_id: 'r1', p_action: 'warn', p_admin_id: 'a', p_reason: 'spam', p_duration_hours: null, p_notify_user: true,
    }] });
  });

  it('dismisses many, and says what the server did', async () => {
    rpc({ data: { dismissed: 3 }, error: null });
    expect(await ModerationService.bulkDismiss(['a', 'b', 'c'], 'adm')).toEqual({ dismissed: 3 });
    expect(calls[0].args[1]).toMatchObject({ p_reason: 'Bulk dismissed' });
  });

  it('throws a refused verdict or dismissal', async () => {
    rpc(refused);
    await expect(ModerationService.resolveReportV2('r1', 'ban', { admin_id: 'a', reason: 'x' })).rejects.toBeTruthy();
    await expect(ModerationService.bulkDismiss(['a'], 'adm')).rejects.toBeTruthy();
  });
});

describe('the priority queue', () => {
  it('passes the compound cursor, and puts a face and name to each accused', async () => {
    rpc({ data: [{ id: 'r1', target_user_id: 'u1' }, { id: 'r2', target_user_id: 'u1' }], error: null });
    from({ data: [{ id: 'u1', username: 'accused' }], error: null });
    const rows = await ModerationService.getPriorityQueue(20, { report_count: 3, created_at: 't', id: 'r0' });
    expect(calls[0].args[1]).toEqual({ p_limit: 20, p_cursor_count: 3, p_cursor_created: 't', p_cursor_id: 'r0' });
    expect(calls).toContainEqual({ fn: 'in', args: ['id', ['u1']] });
    expect(rows.map((r) => (r.target_user as { username: string }).username)).toEqual(['accused', 'accused']);
  });

  it('still shows the cases when the names cannot be read', async () => {
    rpc({ data: [{ id: 'r1', target_user_id: 'u1' }], error: null });
    jest.spyOn(supabase, 'from').mockImplementation(() => { throw new Error('offline'); });
    const rows = await ModerationService.getPriorityQueue();
    expect(rows).toEqual([{ id: 'r1', target_user_id: 'u1' }]);
  });
});

describe('the evidence', () => {
  it('is what the server holds, or says it is gone', async () => {
    rpc({ data: { found: true, title: 'A log' }, error: null });
    expect(await ModerationService.getReportEvidence('r1')).toEqual({ found: true, title: 'A log' });
    rpc({ data: null, error: null });
    expect(await ModerationService.getReportEvidence('r1')).toEqual({ found: false });
  });
});

describe("the accused's record", () => {
  it('is read once for the page and grouped by member', async () => {
    rpc({ data: [
      { id: 'h1', target_user_id: 'u1', action: 'warn' },
      { id: 'h2', target_user_id: 'u2', action: 'mute' },
      { id: 'h3', target_user_id: 'u1', action: 'ban' },
    ], error: null });
    const byUser = await ModerationService.getModerationHistoryForUsers(['u1', 'u2', 'u1', '']);
    expect(calls[0].args[1]).toEqual({ p_user_ids: ['u1', 'u2'], p_per_user: 5 });
    expect(byUser.u1.map((r) => r.id)).toEqual(['h1', 'h3']);
    expect(byUser.u2.map((r) => r.id)).toEqual(['h2']);
  });

  it('asks nothing for a page with nobody on it', async () => {
    rpc({ data: [], error: null });
    expect(await ModerationService.getModerationHistoryForUsers([])).toEqual({});
    expect(calls).toEqual([]);
  });

  it('throws a failed read rather than answer a clean record', async () => {
    rpc(refused);
    await expect(ModerationService.getModerationHistoryForUsers(['u1'])).rejects.toBeTruthy();
  });

  it('on the Tribunal, a record not read says so, and can be asked for again', () => {
    const retry = jest.fn();
    const { getByText, getByLabelText } = render(<EnforcementHistory history={[]} isLoading={false} failed onRetry={retry} />);
    expect(getByText('The record could not be read.')).toBeTruthy();
    fireEvent.press(getByLabelText('Read the enforcement record again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('and a record read empty draws nothing, as a clean record does', () => {
    const { toJSON } = render(<EnforcementHistory history={[]} isLoading={false} />);
    expect(toJSON()).toBeNull();
  });
});
