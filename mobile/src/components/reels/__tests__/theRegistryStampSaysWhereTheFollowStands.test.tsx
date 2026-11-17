/**
 * theRegistryStampSaysWhereTheFollowStands.test.tsx — review round 8 (MemberRegistry)
 * ─────────────────────────────────────────────────────────────────────────────
 * The registry's stamp is drawn three ways, FOLLOW, REQUESTED and ✦ FOLLOWED, and was said two:
 * a request still waiting on the other member's answer was read aloud as "Following", which it
 * is not. Each is said as it is drawn now: a request is said as one, waiting on their answer.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { MemberRegistry } from '../MemberRegistry';
import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import type { NotableMember } from '@/src/services/MemberDiscoveryService';

const mk = (id: string, username: string): NotableMember => ({
  id, username, avatar_url: null, role: null, member_no: null, is_founding: null, is_social_private: false,
});
const mockMembers: NotableMember[] = [mk('u1', 'vertigo'), mk('u2', 'Morpho'), mk('u3', 'kane')];
jest.mock('@/src/hooks/useNotableMembers', () => ({ useNotableMembers: () => ({ data: mockMembers }) }));

const AS_BUILT = useSocialStore.getState();
afterEach(() => {
  useSocialStore.setState({ following: AS_BUILT.following, requested: AS_BUILT.requested, _followingIndex: AS_BUILT._followingIndex, _requestedIndex: AS_BUILT._requestedIndex });
});

it('a request waiting on its answer is said as one, never as a follow; a member not followed says FOLLOW', async () => {
  await act(async () => {
    useAuthStore.setState({ user: { id: 'me', username: 'sajjadobaidi' } as never } as never);
    useSocialStore.getState().setRequested(['morpho']);
  });
  const r = render(<MemberRegistry visible />);
  const requested = r.getByLabelText('Requested @Morpho: waiting on their answer');
  expect(requested).toBeTruthy();
  expect(r.getByText('REQUESTED')).toBeTruthy();
  expect(r.queryByLabelText('Following @Morpho')).toBeNull();
  expect(r.getByLabelText('Follow @vertigo')).toBeTruthy();
});

it('a member the stamp draws as followed is said as it is drawn: Followed', async () => {
  await act(async () => {
    useAuthStore.setState({ user: { id: 'me', username: 'sajjadobaidi' } as never } as never);
  });
  const r = render(<MemberRegistry visible />);
  expect(r.getByLabelText('Follow @kane')).toBeTruthy();
  // The stamp reads the follow by its index; the rows are drawn from the follow list itself.
  await act(async () => { useSocialStore.setState({ _followingIndex: new Set(['kane']) }); });
  expect(r.getByText('✦ FOLLOWED')).toBeTruthy();
  expect(r.getByLabelText('Followed @kane')).toBeTruthy();
  expect(r.queryByLabelText('Following @kane')).toBeNull();
});
