/**
 * aMissingLogIsAnAnswer.test.tsx — a log that is not there, and an author whose
 * name could not be read.
 *
 * getLogDetails threw "Log not found" for a log with no row, so the page could
 * not tell a deleted log from an unreachable one: the moment the page said a
 * failed read as one, a deleted log would have read "could not be reached".
 * It answers null now, and throws only what failed.
 *
 * A critique whose author's profile could not be read was signed "unknown",
 * and the byline opened /user/unknown: a name any member may hold. It is now
 * nameless — "a member", and no link.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { supabase } from '@/src/lib/supabase';
import { LogService } from '@/src/services/LogService';
import { CritiqueRow } from '@/src/components/critique/CritiqueRow';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/utils/withAbortSignal', () => ({ withAbortSignal: (q: unknown) => q }));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
let mockQueue: { type: string; payload: Record<string, unknown> }[] = [];
jest.mock('@/src/utils/offlineQueue', () => ({ getOfflineQueue: () => mockQueue }));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', username: 'me' } }) },
}));

/** A PostgREST chain answering every read with \`answer\`. */
function answering(answer: { data?: unknown; error: unknown; count?: number }) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const k of ['select', 'eq', 'in', 'order', 'limit']) c[k] = jest.fn(self);
  c.maybeSingle = jest.fn(() => Promise.resolve(answer));
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  return c;
}
const from = supabase.from as jest.Mock;

beforeEach(() => { from.mockReset(); mockQueue = []; });

describe('a log that is not there', () => {
  it('is null, not an error', async () => {
    from.mockReturnValue(answering({ data: null, error: null }));
    await expect(LogService.getLogDetails('l1')).resolves.toBeNull();
  });

  it('removed on this phone and not yet in the house, is null too', async () => {
    mockQueue = [{ type: 'remove_log', payload: { log_id: 'l1' } }];
    await expect(LogService.getLogDetails('l1')).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('a read that failed is still thrown — never answered as "not there"', async () => {
    from.mockReturnValue(answering({ data: null, error: { message: 'Network request failed' } }));
    await expect(LogService.getLogDetails('l1')).rejects.toEqual({ message: 'Network request failed' });
  });
});

describe('a critique whose author could not be read', () => {
  it('comes without a name, never "unknown"', async () => {
    const row = { id: 'c1', log_id: 'l1', user_id: 'u9', body: 'Held breath.', created_at: '2026-09-01T00:00:00Z' };
    from
      .mockReturnValueOnce(answering({ data: [row], error: null }))       // the page
      .mockReturnValueOnce(answering({ data: null, error: null, count: 1 })) // the total
      .mockReturnValueOnce(answering({ data: null, error: { message: 'Network request failed' } })); // the names
    const { comments } = await LogService.getLogComments('l1');
    expect(comments).toHaveLength(1);
    expect(comments[0].profiles ?? null).toBeNull();
  });

  it('is drawn as "a member", and its byline opens nothing', async () => {
    const onPressUser = jest.fn();
    const r = render(
      <CritiqueRow c={{ id: 'c1', user_id: 'u9', username: '', body: 'Held breath.', created_at: '2026-09-01T00:00:00Z' }}
        onWithdraw={jest.fn()} onPressUser={onPressUser} />,
    );
    expect(r.getByText('a member')).toBeTruthy();
    expect(r.queryByText(/unknown/)).toBeNull();
    await act(async () => { fireEvent.press(r.getByLabelText('Critique by a member')); });
    expect(onPressUser).not.toHaveBeenCalled();
  });

  it('while a named author is still a link', () => {
    const r = render(
      <CritiqueRow c={{ id: 'c1', user_id: 'u9', username: 'morpho', body: 'Held breath.', created_at: '2026-09-01T00:00:00Z' }}
        onWithdraw={jest.fn()} onPressUser={jest.fn()} />,
    );
    expect(r.getByLabelText('View profile of @morpho')).toBeTruthy();
  });
});
