/**
 * aSuspensionIsSaid.test.tsx — a silenced or suspended member is told so,
 * and told when it ends.
 *
 * The database refuses their every write, in a sentence written for them; the
 * app showed each write's own "could not save" and read a ban but never a
 * suspension. Now the standing is read with the profile, said by one notice
 * while it lasts, and read again the moment the server refuses for it.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import StandingNotice from '../StandingNotice';
import { standingOf, isStandingRefusal, refreshStanding } from '@/src/utils/standing';
import { useAuthStore } from '@/src/stores/auth';
import { supabase, fetchHearingRefusals } from '@/src/lib/supabase';
import { onRefusal } from '@/src/lib/refusalEvents';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-02T12:00:00Z');

describe('the standing, read from the profile', () => {
  it.each([
    [{ is_banned: true }, 'silenced'],
    [{ is_banned: true, suspended_until: new Date(NOW + HOUR).toISOString() }, 'silenced'],
    [{ suspended_until: new Date(NOW + HOUR).toISOString() }, 'suspended'],
    [{ suspended_until: new Date(NOW - HOUR).toISOString() }, null],
    [{ suspended_until: null }, null],
    [{}, null],
  ])('%j is %s', (user, kind) => {
    expect(standingOf(user, NOW)?.kind ?? null).toBe(kind);
  });

  it('knows the server\'s two sentences, and nothing else', () => {
    expect(isStandingRefusal('Your account has been silenced by The Society.')).toBe(true);
    expect(isStandingRefusal('Your account is suspended until 04 Oct 2026 18:00 UTC.')).toBe(true);
    expect(isStandingRefusal('The Lounge is an Archivist feature')).toBe(false);
    expect(isStandingRefusal(undefined)).toBe(false);
  });
});

describe('the notice', () => {
  afterEach(() => { act(() => { useAuthStore.setState({ user: null }); }); jest.useRealTimers(); });

  it('says nothing to a member in good standing', () => {
    act(() => { useAuthStore.setState({ user: { id: 'u1' } as never }); });
    expect(render(<StandingNotice />).toJSON()).toBeNull();
  });

  it('a silenced member is told, and told what they may still do', () => {
    act(() => { useAuthStore.setState({ user: { id: 'u1', is_banned: true } as never }); });
    const r = render(<StandingNotice />);
    expect(r.getByText('SILENCED BY THE SOCIETY')).toBeTruthy();
    expect(r.getByText('YOU MAY READ. YOU MAY NOT WRITE.')).toBeTruthy();
    expect(r.getByLabelText(/^Your account has been silenced by The Society\. You may read, and may not write\.$/)).toBeTruthy();
  });

  it('a suspended member is told until when, and the notice goes when it ends', async () => {
    jest.useFakeTimers({ now: NOW });
    const until = new Date(NOW + 2 * HOUR).toISOString();
    act(() => { useAuthStore.setState({ user: { id: 'u1', suspended_until: until } as never }); });
    const r = render(<StandingNotice />);
    expect(r.getByText(/^SUSPENDED UNTIL [A-Z]{3} \d{1,2}, 2026, \d{2}:\d{2} (AM|PM)$/)).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(2 * HOUR + 2000); });
    expect(r.queryByText(/^SUSPENDED UNTIL/)).toBeNull();
  });
});

describe('a refusal for standing reads it again', () => {
  it('any write the server refuses is heard, sentence and all, and the caller still gets its answer', async () => {
    const heard: string[] = [];
    const stop = onRefusal((m) => heard.push(m));
    const said = 'Your account is suspended until 04 Oct 2026 18:00 UTC.';
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ code: '42501', message: said }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })) as never;
    try {
      // The client is built on this fetch (the library itself is a stand-in here).
      const built = (jest.requireMock('@supabase/supabase-js') as { createClient: jest.Mock }).createClient.mock.calls;
      expect(built.some((c) => c[2]?.global?.fetch === fetchHearingRefusals)).toBe(true);
      const res = await fetchHearingRefusals('https://dummy.supabase.co/rest/v1/logs', { method: 'POST' });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: '42501', message: said });
      await new Promise((r) => setTimeout(r, 0));
      expect(heard).toEqual([said]);
    } finally {
      global.fetch = realFetch;
      stop();
    }
  });

  it('fetches the member\'s standing into the profile the app holds', async () => {
    act(() => { useAuthStore.setState({ user: { id: 'u1', username: 'vesper' } as never }); });
    const until = new Date(Date.now() + HOUR).toISOString();
    const single = jest.fn().mockResolvedValue({ data: { is_banned: false, suspended_until: until }, error: null });
    jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq: () => ({ single }) }) } as never);
    await refreshStanding();
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', username: 'vesper', suspended_until: until });
    act(() => { useAuthStore.setState({ user: null }); });
  });
});
