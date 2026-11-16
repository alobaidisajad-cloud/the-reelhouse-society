/**
 * theDoorSaysWhatItCouldNotRead.test.tsx — "At the Door", the follow requests.
 *
 * A failed read of the door returned an empty page, and the panel said "No
 * one's at the door." to a member with people waiting; a failed count set the
 * banner's count to 0, and the banner vanished. "@kane" found no petitioner.
 * And DECLINE ALL REMAINING turned the whole queue away on one tap — those
 * not loaded and those outside a search too — with no way back.
 */
import React, { act } from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

type Op = [string, ...unknown[]];
const mockReads: Op[][] = [];
let mockAnswer: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };
const mockRpc = jest.fn(async (..._args: unknown[]) => ({ data: 1, error: null }));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const ops: Op[] = [];
      mockReads.push(ops);
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'order', 'limit', 'or', 'lt', 'ilike', 'not']) chain[k] = (...a: unknown[]) => { ops.push([k, ...a]); return chain; };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(mockAnswer).then(res, rej);
      return chain;
    },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});

// eslint-disable-next-line import/first
import { FollowRequestService } from '@/src/services/FollowRequestService';
// eslint-disable-next-line import/first
import { refreshFollowRequestCount } from '@/src/hooks/useFollowRequests';
// eslint-disable-next-line import/first
import { useSocialStore } from '@/src/stores/followStore';
// eslint-disable-next-line import/first
import FollowRequestsPanel from '../FollowRequestsPanel';
// eslint-disable-next-line import/first
import { useBlockStore } from '@/src/stores/blockStore';

const down = { data: null, error: { message: 'Network request failed' }, count: undefined };
const petitioner = { id: 'i1', user_id: 'u1', created_at: '2026-10-01T00:00:00Z', profiles: { username: 'orson', avatar_url: null } };

beforeEach(() => {
  mockReads.length = 0;
  mockRpc.mockClear();
  mockAnswer = { data: [], error: null, count: 0 };
});

describe('the service', () => {
  it('a door it could not read is not an empty one: the read throws', async () => {
    mockAnswer = down;
    await expect(FollowRequestService.fetchPage({ myId: 'me' })).rejects.toThrow();
  });

  it('a count it could not read is not zero, and the banner keeps the last one', async () => {
    useSocialStore.getState().setPendingRequestCount(4);
    mockAnswer = down;
    expect(await FollowRequestService.count('me')).toBeNull();
    await refreshFollowRequestCount();
    expect(useSocialStore.getState().pendingRequestCount).toBe(4);
  });

  it('"@orson" looks for orson', async () => {
    await FollowRequestService.fetchPage({ myId: 'me', search: '@orson' });
    const ilike = mockReads.flat().find(([k]) => k === 'ilike')!;
    expect(ilike).toEqual(['ilike', 'profiles.username', '*orson*']);
  });
});

describe('the panel', () => {
  // It opened on "No one's at the door." for its first frames, before its read began, under a
  // banner counting the members waiting (P0.112).
  it('opens reading, before its read has begun, and says the door is empty only once answered', async () => {
    const r = render(<FollowRequestsPanel visible onClose={() => {}} />);
    expect(r.getByLabelText('Reading the door')).toBeTruthy();
    expect(r.queryByText("No one's at the door.")).toBeNull();
    await waitFor(() => expect(r.getByText("No one's at the door.")).toBeTruthy());
    expect(r.queryByLabelText('Reading the door')).toBeNull();
  });

  it('offers no member hidden now, to be admitted across a block', async () => {
    const blocked = { id: 'i2', user_id: 'u2', created_at: '2026-10-02T00:00:00Z', profiles: { username: 'welles', avatar_url: null } };
    mockAnswer = { data: [blocked, petitioner], error: null, count: 2 };
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FollowRequestsPanel visible onClose={() => {}} />); });
    await waitFor(() => expect(r.getByText('@WELLES')).toBeTruthy());
    await act(async () => { useBlockStore.setState({ blocked: ['u2'], _blockedIndex: new Set(['u2']) }); });
    expect(r.queryByText('@WELLES')).toBeNull();
    expect(r.getByText('@ORSON')).toBeTruthy();
    await act(async () => { useBlockStore.setState({ blocked: [], _blockedIndex: new Set() }); });
  });

  it('says the door could not be reached, never that no one is there', async () => {
    mockAnswer = down;
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FollowRequestsPanel visible onClose={() => {}} />); });
    await waitFor(() => expect(r.getByText('The door could not be reached.')).toBeTruthy());
    expect(r.queryByText("No one's at the door.")).toBeNull();
    mockAnswer = { data: [petitioner], error: null, count: 1 };
    await act(async () => { await fireEvent.press(r.getByLabelText('Try again')); });
    await waitFor(() => expect(r.getByText('@ORSON')).toBeTruthy());
  });

  it('asks before declining everyone, and declines only once asked', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useSocialStore.getState().setPendingRequestCount(12);
    mockAnswer = { data: [petitioner], error: null, count: 12 };
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FollowRequestsPanel visible onClose={() => {}} />); });
    await waitFor(() => expect(r.getByText('@ORSON')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Decline all remaining requests')); });
    expect(mockRpc).not.toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Decline all 12 requests?');
    await act(async () => { buttons.find((b) => b.text === 'Decline all')!.onPress!(); });
    expect(mockRpc).toHaveBeenCalledWith('decline_all_follow_requests');
    alert.mockRestore();
  });
});

describe('review round 5', () => {
  afterEach(() => { useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() }); });

  it('counts no request from a member blocked or muted, as the door offers none', async () => {
    useBlockStore.setState({ blocked: ['u2'], muted: ['u3'], _blockedIndex: new Set(['u2']), _mutedIndex: new Set(['u3']) });
    mockAnswer = { data: null, error: null, count: 0 };
    await refreshFollowRequestCount();
    const not = mockReads.flat().find(([k]) => k === 'not');
    expect(not).toEqual(['not', 'user_id', 'in', '(u2,u3)']);
    expect(useSocialStore.getState().pendingRequestCount).toBe(0);
  });

  it('with nobody hidden, the count asks for every request', async () => {
    await FollowRequestService.count('me');
    expect(mockReads.flat().some(([k]) => k === 'not')).toBe(false);
  });

  it('a second ADMIT while the first is answered is taken, each row busy on its own', async () => {
    const second = { id: 'i3', user_id: 'u4', created_at: '2026-10-03T00:00:00Z', profiles: { username: 'ford', avatar_url: null } };
    mockAnswer = { data: [second, petitioner], error: null, count: 2 };
    let answerFirst: (v: unknown) => void = () => {};
    mockRpc.mockImplementationOnce(() => new Promise((r) => { answerFirst = r; }) as never);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<FollowRequestsPanel visible onClose={() => {}} />); });
    await waitFor(() => expect(r.getByText('@ORSON')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Admit orson')); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Admit ford')); });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls.map((c) => (c[1] as { requester_id: string }).requester_id).sort()).toEqual(['u1', 'u4']);
    await act(async () => { answerFirst({ data: 1, error: null }); });
  });
});
