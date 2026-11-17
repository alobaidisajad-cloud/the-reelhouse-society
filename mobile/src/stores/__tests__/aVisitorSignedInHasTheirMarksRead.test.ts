/**
 * aVisitorSignedInHasTheirMarksRead.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A visitor reads the paper (or a filing), is asked in by CERTIFY, SAVE or a vote, and signs in.
 * Every filing the store held had its marks read as nobody, which reads nothing; signed in, each
 * mark was drawn "Reading your mark", greyed, until the member pulled the paper to read it again,
 * and a filing's critiques the same.
 *
 * Now a sign-in from nobody reads the member's marks and critique certifications for everything
 * the store holds. A sign-in over another member is the reset's (leaveBehind), not this.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { readMarksWhenAVisitorSignsIn, useDispatch } from '../dispatch';
import { useAuthStore } from '../auth';
import type { Critique, Filing } from '../dispatchTypes';

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '77777777-7777-4777-8777-777777777777';
const ON_THE_PAPER = '00000017-0000-4000-8000-000000000017';
const OPENED = '00000018-0000-4000-8000-000000000018';
const CRITIQUE = '00000019-0000-4000-8000-000000000019';

let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const house = () => supabaseFake({
  rows: {
    dispatch_certifications: [
      { id: '88888888-8888-4888-8888-888888888881', user_id: ME, post_id: ON_THE_PAPER },
      { id: '88888888-8888-4888-8888-888888888882', user_id: ME, comment_id: CRITIQUE },
    ],
    dispatch_saves: [{ user_id: ME, post_id: OPENED }],
    dispatch_votes: [],
  },
});
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); };

let stop: () => void = () => {};
beforeEach(() => {
  useAuthStore.setState({ user: null } as never);
  mockHouse = house();
  // As a visitor's store stands: a paper row, a filing opened from a link, a critique read, no mark known.
  useDispatch.setState({
    filings: [{ id: ON_THE_PAPER } as Filing],
    opened: { [OPENED]: { id: OPENED } as Filing },
    critiques: { [OPENED]: [{ id: CRITIQUE, postId: OPENED } as Critique] },
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() },
    certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set(),
  } as never);
  stop = readMarksWhenAVisitorSignsIn();
});
afterEach(() => stop());

it('a visitor who signs in has their marks read for every filing the store holds, the paper and the one opened', async () => {
  useAuthStore.setState({ user: { id: ME, username: 'kane' } } as never);
  await settle();
  const st = useDispatch.getState();
  expect([...st.marksKnown.certified].sort()).toEqual([ON_THE_PAPER, OPENED]);
  expect([...st.marksKnown.saved].sort()).toEqual([ON_THE_PAPER, OPENED]);
  expect([...st.marksKnown.voted].sort()).toEqual([ON_THE_PAPER, OPENED]);
  expect([...st.certifiedIds]).toEqual([ON_THE_PAPER]);
  expect([...st.savedIds]).toEqual([OPENED]);
});

it('and their certifications of the critiques it holds', async () => {
  useAuthStore.setState({ user: { id: ME, username: 'kane' } } as never);
  await settle();
  const st = useDispatch.getState();
  expect([...st.critiqueMarksKnown]).toEqual([CRITIQUE]);
  expect([...st.certifiedCritiqueIds]).toEqual([CRITIQUE]);
});

it('a member signed in over another is not read here: the reset that leaves the last member behind comes first', async () => {
  useAuthStore.setState({ user: { id: OTHER, username: 'ana' } } as never);
  await settle();
  const before = mockHouse.asked.length;
  useAuthStore.setState({ user: { id: ME, username: 'kane' } } as never);
  await settle();
  expect(mockHouse.asked.length).toBe(before);
});

it('the same member, their profile read again, asks nothing again', async () => {
  useAuthStore.setState({ user: { id: ME, username: 'kane' } } as never);
  await settle();
  const before = mockHouse.asked.length;
  useAuthStore.setState({ user: { id: ME, username: 'kane', bio: 'Ozu.' } } as never);
  await settle();
  expect(mockHouse.asked.length).toBe(before);
});
