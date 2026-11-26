/**
 * aDeskLeavesAsItCame.test.tsx — review round 4 (navigation)
 * ──────────────────────────────────────────────────────────
 * The short desks (take, seeking, wire) and the ballot's, and every way out of them:
 *
 *   · a filing went home with `router.replace('/(tabs)/dispatch')`, building a second tab app over
 *     the first; it now closes back to the Dispatch already there;
 *   · BACK on an amended take cleared the form but kept the amend, and the route opened the
 *     ESSAY desk on a take; an amend now goes back to the filing it came from;
 *   · a take's words went without a word on any way out; the desk now keeps its draft, as the
 *     essay and the ballot keep theirs (stage C: nothing a member types is lost), one for each
 *     form and one for each amend, taken up with START CLEAN, and every way out keeps it;
 *   · Android's back closed the whole sheet; on a desk it is BACK, to the choice of form;
 *   · the ballot opened on the last ballot in silence, with no way to a clean desk but emptying
 *     it by hand; it now says it was taken up, with START CLEAN, as every writing room does, and
 *     keeps the last second's words when it closes.
 */
import React, { act } from 'react';
import { Alert, BackHandler } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ComposeShortScreen, ComposeBallotScreen } from '@/src/components/dispatch/ComposeDesks';
import { clearDraft, readDraft, writeDraft } from '@/src/utils/memberDrafts';

let mockEditId: string | undefined;
let mockHeld: Record<string, unknown> | null = null;
const mockFiled: Record<string, unknown>[] = [];

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', username: 'me', member_no: 7, avatar_url: null } };
      return typeof sel === 'function' ? sel(state) : state;
    },
    { getState: () => ({ user: { id: 'u1', username: 'me' } }) },
  ),
}));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: {
    getState: () => ({
      file: async (d: Record<string, unknown>) => { mockFiled.push(d); return { id: 'new' }; },
      amend: async () => ({ offline: false }),
      filings: mockHeld ? [mockHeld] : [],
      opened: mockHeld ? { [String(mockHeld.id)]: mockHeld } : {},
    }),
  },
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), setParams: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ edit: mockEditId }),
  Stack: { Screen: () => null },
}));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: async () => ({ results: [] }) } }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const type = async (field: unknown, text: string) => {
  await act(async () => { await fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { await fireEvent.press(control as never); });
};

type Held = { handler: () => boolean | null | undefined; remove: jest.Mock };
let held: Held[] = [];
let alerts: [string, string | undefined, { text: string; onPress?: () => void }[] | undefined][] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockFiled.length = 0;
  mockEditId = undefined;
  mockHeld = null;
  clearDraft('u1', 'ballot');
  // No draft of any desk carried from the last test.
  require('@/src/stores/mmkv-storage').storage.clearAll();
  held = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((event: string, handler: () => boolean) => {
    const sub = { handler, remove: jest.fn() };
    if (event === 'hardwareBackPress') held.push(sub);
    return { remove: sub.remove };
  }) as never);
  alerts = [];
  jest.spyOn(Alert, 'alert').mockImplementation(((t: string, m?: string, b?: never) => { alerts.push([t, m, b]); }) as never);
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

/** Android's back, asked of the latest handler standing, as Android asks. */
const androidBack = async () => {
  const standing = held.filter((h) => h.remove.mock.calls.length === 0);
  const last = standing[standing.length - 1];
  expect(last).toBeDefined();
  let taken: boolean | null | undefined;
  await act(async () => { taken = last!.handler(); });
  return taken;
};

describe('a short desk', () => {
  it('files and goes home to the Dispatch already beneath, never building a second', async () => {
    const r = render(<ComposeShortScreen kind="take" />);
    await type(r.getByLabelText('Your take'), 'Ozu never once stood up.');
    await press(r.getByLabelText('File it'));
    expect(mockFiled).toHaveLength(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('BACK with nothing written goes to the choice of form at once', async () => {
    const r = render(<ComposeShortScreen kind="take" />);
    await press(r.getByLabelText('Back, without filing'));
    expect(alerts).toEqual([]);
    expect(router.setParams).toHaveBeenCalledWith({ kind: '' });
  });

  it('BACK with words goes to the forms at once, asking nothing: the words are kept', async () => {
    const r = render(<ComposeShortScreen kind="take" />);
    await type(r.getByLabelText('Your take'), 'Ozu never once stood up.');
    await press(r.getByLabelText('Back, without filing'));
    expect(alerts).toEqual([]);
    expect(router.setParams).toHaveBeenCalledWith({ kind: '' });
    // The desk goes with the kind: what was typed a moment before is kept as it goes.
    r.unmount();
    expect(readDraft('u1', 'short', 'take')?.data.body).toBe('Ozu never once stood up.');
  });

  it("Android's back is BACK: to the forms, the sheet still open", async () => {
    render(<ComposeShortScreen kind="wire" />);
    expect(await androidBack()).toBe(true);
    expect(router.setParams).toHaveBeenCalledWith({ kind: '' });
    expect(router.back).not.toHaveBeenCalled();
  });

  describe('amending a filing', () => {
    beforeEach(() => {
      mockEditId = '00000019-0000-4000-8000-000000000019';
      mockHeld = {
        id: mockEditId, kind: 'take', authorId: 'u1', author: { name: 'me', memberNo: 7, tier: 'free' },
        film: null, subjectId: null, subjectKind: null, title: null, body: 'Ozu never once stood up.',
        fullContent: null, source: null, sourceUrl: null, options: null, closesAt: null, frozenTotals: null,
        answerId: null, seriesId: null, seriesTitle: null, partNumber: null, spoilerLabel: null,
        withheldAt: null, endedAt: null, endedBy: null, certifyCount: 0, commentCount: 0,
        createdAt: '2026-08-28T21:00:00Z', editedAt: null,
      };
    });

    it('BACK goes back to the filing, never to another desk', async () => {
      const r = render(<ComposeShortScreen kind="take" />);
      await press(r.getByLabelText('Back, without filing'));
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(router.setParams).not.toHaveBeenCalled();
    });

    it('amended, it goes back to the filing it amended', async () => {
      const r = render(<ComposeShortScreen kind="take" />);
      await type(r.getByLabelText('Your take'), 'Ozu never once stood up, and that is the argument.');
      await press(r.getByLabelText('Amend it'));
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(router.dismissTo).not.toHaveBeenCalled();
    });

    it("keeps no back of its own: Android's back leaves to the filing, as the route does", () => {
      render(<ComposeShortScreen kind="take" />);
      expect(held.filter((h) => h.remove.mock.calls.length === 0)).toEqual([]);
    });
  });

  // An amendment sends the words, never the film: a film chosen on the desk was drawn there and
  // dropped by the amendment without a word (review round 6).
  it('a new filing offers FILM and STILL; an amendment offers neither, the film stays as it was filed', () => {
    const fresh = render(<ComposeShortScreen kind="take" />);
    expect(fresh.getByLabelText('Name a film')).toBeTruthy();
    expect(fresh.getByLabelText('Add a still')).toBeTruthy();
    fresh.unmount();

    mockEditId = '00000019-0000-4000-8000-000000000019';
    mockHeld = {
      id: mockEditId, kind: 'take', authorId: 'u1', author: { name: 'me', memberNo: 7, tier: 'free' },
      film: null, subjectId: null, subjectKind: null, title: null, body: 'Ozu never once stood up.',
      fullContent: null, source: null, sourceUrl: null, options: null, closesAt: null, frozenTotals: null,
      answerId: null, seriesId: null, seriesTitle: null, partNumber: null, spoilerLabel: null,
      withheldAt: null, endedAt: null, endedBy: null, certifyCount: 0, commentCount: 0,
      createdAt: '2026-08-28T21:00:00Z', editedAt: null,
    };
    const amend = render(<ComposeShortScreen kind="take" />);
    expect(amend.getByLabelText('Amend it')).toBeTruthy();
    expect(amend.queryByLabelText('Name a film')).toBeNull();
    expect(amend.queryByLabelText('Add a still')).toBeNull();
  });
});

describe('a short desk keeps its draft', () => {
  it('a take taken up says so, with START CLEAN, which empties the desk and the draft', async () => {
    writeDraft('u1', 'short', { body: 'Ozu never once stood up.', source: '', film: null, filmId: null, spoiler: true }, 'take');
    const r = render(<ComposeShortScreen kind="take" />);
    expect(r.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.');
    expect(r.getByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeTruthy();
    await press(r.getByLabelText('Start clean, and discard what was here'));
    expect(r.getByLabelText('Your take').props.value).toBe('');
    expect(r.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
    expect(readDraft('u1', 'short', 'take')).toBeNull();
  });

  it('the line goes on the first change, as the essay’s does', async () => {
    writeDraft('u1', 'short', { body: 'Ozu never once stood up.' }, 'take');
    const r = render(<ComposeShortScreen kind="take" />);
    await type(r.getByLabelText('Your take'), 'Ozu never once stood up, and that is the point.');
    expect(r.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
  });

  it('each form keeps its own: a take is never opened into a seeking’s desk, and a wire keeps its source', async () => {
    writeDraft('u1', 'short', { body: 'Ozu never once stood up.' }, 'take');
    writeDraft('u1', 'short', { body: 'A print of Tokyo Story, unrestored.', source: 'BFI' }, 'wire');
    const seeking = render(<ComposeShortScreen kind="seeking" />);
    expect(seeking.getByLabelText('Your seeking').props.value).toBe('');
    expect(seeking.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
    seeking.unmount();
    const wire = render(<ComposeShortScreen kind="wire" />);
    expect(wire.getByLabelText('Your wire').props.value).toBe('A print of Tokyo Story, unrestored.');
    expect(wire.getByDisplayValue('BFI')).toBeTruthy();
  });

  it('kept once the desk rests, and at once if it closes first; filed, the draft goes', async () => {
    const r = render(<ComposeShortScreen kind="take" />);
    await type(r.getByLabelText('Your take'), 'Ozu never once stood up.');
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(readDraft('u1', 'short', 'take')?.data.body).toBe('Ozu never once stood up.');
    await type(r.getByLabelText('Your take'), 'Ozu never once stood up. Not once.');
    await press(r.getByLabelText('File it'));
    expect(mockFiled).toHaveLength(1);
    r.unmount();
    expect(readDraft('u1', 'short', 'take')).toBeNull();
  });

  describe('an amend', () => {
    beforeEach(() => {
      mockEditId = '00000019-0000-4000-8000-000000000019';
      mockHeld = {
        id: mockEditId, kind: 'take', authorId: 'u1', author: { name: 'me', memberNo: 7, tier: 'free' },
        film: null, subjectId: null, subjectKind: null, title: null, body: 'Ozu never once stood up.',
        fullContent: null, source: null, sourceUrl: null, options: null, closesAt: null, frozenTotals: null,
        answerId: null, seriesId: null, seriesTitle: null, partNumber: null, spoilerLabel: null,
        withheldAt: null, endedAt: null, endedBy: null, certifyCount: 0, commentCount: 0,
        createdAt: '2026-08-28T21:00:00Z', editedAt: null,
      };
    });

    it('is kept by its filing, apart from a new take, and taken up over the words as filed', async () => {
      const r = render(<ComposeShortScreen kind="take" />);
      await type(r.getByLabelText('Your take'), 'Ozu never once stood up, and that is the argument.');
      r.unmount();
      expect(readDraft('u1', 'edit', mockEditId)?.data.content).toBe('Ozu never once stood up, and that is the argument.');
      expect(readDraft('u1', 'short', 'take')).toBeNull();
      const again = render(<ComposeShortScreen kind="take" />);
      expect(again.getByLabelText('Your take').props.value).toBe('Ozu never once stood up, and that is the argument.');
      // START CLEAN puts back the words as filed.
      await press(again.getByLabelText('Start clean, and discard what was here'));
      expect(again.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.');
      expect(readDraft('u1', 'edit', mockEditId)).toBeNull();
    });

    it('left as filed keeps nothing; amended, its draft goes', async () => {
      const r = render(<ComposeShortScreen kind="take" />);
      r.unmount();
      expect(readDraft('u1', 'edit', mockEditId)).toBeNull();
      const amend = render(<ComposeShortScreen kind="take" />);
      await type(amend.getByLabelText('Your take'), 'Ozu never once stood up, and that is the argument.');
      await press(amend.getByLabelText('Amend it'));
      amend.unmount();
      expect(readDraft('u1', 'edit', mockEditId)).toBeNull();
    });
  });
});

describe('the ballot desk', () => {
  it('a ballot taken up says so, with START CLEAN, which empties the desk and the draft', async () => {
    writeDraft('u1', 'ballot', { question: 'Which Ozu?', slots: [], closes: '2 DAYS' });
    const r = render(<ComposeBallotScreen />);
    expect(r.getByLabelText('Your question').props.value).toBe('Which Ozu?');
    expect(r.getByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeTruthy();
    await press(r.getByLabelText('Start clean, and discard what was here'));
    expect(r.getByLabelText('Your question').props.value).toBe('');
    expect(r.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
    expect(readDraft('u1', 'ballot')).toBeNull();
  });

  it('the line goes on the first change, as the essay’s does', async () => {
    writeDraft('u1', 'ballot', { question: 'Which Ozu?', slots: [], closes: '2 DAYS' });
    const r = render(<ComposeBallotScreen />);
    expect(r.getByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeTruthy();
    await type(r.getByLabelText('Your question'), 'Which Ozu, finally?');
    expect(r.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
  });

  it('a fresh desk says nothing was taken up', () => {
    const r = render(<ComposeBallotScreen />);
    expect(r.getByLabelText('Your question').props.value).toBe('');
    expect(r.queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
  });

  it('closed within a second of typing, it keeps the last words', async () => {
    const r = render(<ComposeBallotScreen />);
    await type(r.getByLabelText('Your question'), 'Which Ozu?');
    r.unmount();
    expect(readDraft('u1', 'ballot')?.data.question).toBe('Which Ozu?');
  });

  it("Android's back is BACK: to the forms, the ballot kept", async () => {
    render(<ComposeBallotScreen />);
    expect(await androidBack()).toBe(true);
    expect(router.setParams).toHaveBeenCalledWith({ kind: '' });
  });
});
