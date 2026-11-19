/**
 * aSalonsNameAndWordsAreReadWhole.test.tsx — round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A salon's description runs to 300 characters and its name to 60, and no place a member or a
 * public salon's visitor could reach drew them whole: the cards and ALL SALONS cut both at two
 * lines, the room's header the name at one, and the room's settings sheet the name at one and the
 * description at two. Only the door of a room one cannot read drew them whole. The settings sheet,
 * open to everyone in the room, now draws the name whole beside its X, and the description whole
 * above the roster, where it scrolls.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { create } from 'zustand';

import { LoungeSettingsPanel } from '../LoungeSettingsPanel';
import type { RoomStanding } from '../roomGate';
import { useLoungeStore } from '@/src/stores/lounge';

jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  return { useAuthStore: mockCreate(() => ({ user: null })) };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const { useAuthStore } = jest.requireMock('@/src/stores/auth') as {
  useAuthStore: ReturnType<typeof create> & { setState: (s: object) => void };
};

// Sixty characters of name, three hundred of description: the most the house takes.
const NAME = 'The Society for the Appreciation of Lost Nitrate Melodramas!';
const DESCRIPTION = ('We gather on Sunday evenings to watch the pictures the studios let rot: two-reelers, serials, '
  + 'the lost Murnau fragments, and whatever the archives have found this season. Bring a programme '
  + 'note, a sharp eye and patience for a scratched print; leave the phone in the cloakroom. Seats go to '
  + 'whoever comes.').slice(0, 300);

beforeEach(() => {
  useLoungeStore.setState({ removeMember: jest.fn(), setMemberStatus: jest.fn(), leaveLounge: jest.fn(async () => true) } as never);
  useAuthStore.setState({ user: { id: 'ada', username: 'ada' } });
});

const sheet = (standing: RoomStanding) => render(
  <LoungeSettingsPanel
    lounge={{ id: 'l1', name: NAME, description: DESCRIPTION, creator_id: 'host', is_private: false, cover_image: null, member_count: 12 } as never}
    members={[]} visible isCreator={false} standing={standing} onClose={jest.fn()} />,
);

it('the house holds a salon to these lengths, so this is the longest a member meets', () => {
  expect([NAME.length, DESCRIPTION.length]).toEqual([60, 300]);
});

it.each(['approved', 'none'] as const)('a %s reader of the room reads its name and description whole, never cut', async (standing) => {
  const r = sheet(standing);
  const name = r.getByText(NAME);
  const words = r.getByText(DESCRIPTION);
  expect(name.props.numberOfLines).toBeUndefined();
  expect(words.props.numberOfLines).toBeUndefined();
});

it('a description written right to left is set right to left, by its first strong letter', () => {
  const ar = 'نشاهد أفلام أوزو كل يوم أحد — bring a programme note.';
  const r = render(
    <LoungeSettingsPanel lounge={{ id: 'l1', name: NAME, description: ar, creator_id: 'host', is_private: false, cover_image: null, member_count: 12 } as never}
      members={[]} visible isCreator={false} standing="approved" onClose={jest.fn()} />,
  );
  const style = Object.assign({}, ...[r.getByText(ar).props.style].flat(3).filter(Boolean));
  expect([style.writingDirection, style.textAlign]).toEqual(['rtl', 'right']);
});
