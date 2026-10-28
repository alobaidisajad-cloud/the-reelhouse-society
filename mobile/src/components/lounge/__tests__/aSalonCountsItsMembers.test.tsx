/**
 * A SALON COUNTS ITS MEMBERS, AND NOTHING MORE (P4.16).
 *
 * Seats are unlimited (decided 2026-10-15): no salon is ever full. The corridor's card said
 * "SEATS TAKEN", which reads as a share of some number of seats. The card, the room's header and
 * the door each say the count alone, in the house's voice, one member as one: never a limit,
 * never "of 50".
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GateView } from '@/app/lounge/[id]';
import { PublicLoungeCard } from '@/src/components/lounge/PublicLoungeCard';
import type { LoungeRoom } from '@/src/stores/lounge';
import { supabaseFake } from '@/test-utils/supabaseFake';

/** The house, as strict as production; nothing here reads it, so it holds nothing. */
const mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const room = (memberCount: number, isPrivate = false): LoungeRoom => ({
  id: 'room', name: 'The Back Row', description: 'Late shows, kept.', is_private: isPrivate,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: memberCount,
});

/** A limit beside the count, in any of its words: seats taken, full, "of 50", "12 / 50". */
const LIMIT = /TAKEN|SEATS|FULL|\bOF \d|\d\s*\/\s*\d/i;

describe.each([
  [0, '0 MEMBERS', '0 members behind the door'],
  [1, '1 MEMBER', '1 member behind the door'],
  [51, '51 MEMBERS', '51 members behind the door'],
])('a salon of %i', (n, card, door) => {
  it('the corridor card says the count alone', () => {
    const r = render(<PublicLoungeCard lounge={room(n)} index={0} />);
    expect(r.getByText(card)).toBeTruthy();
    expect(r.queryByText(LIMIT)).toBeNull();
  });

  it('the door of a private salon says the count alone', () => {
    const r = render(
      <GateView gate="request" lounge={room(n, true)} memberCount={n} onRequest={jest.fn()} onRetry={jest.fn()} pending={false} />,
    );
    expect(r.getByText(door)).toBeTruthy();
    expect(r.queryByText(LIMIT)).toBeNull();
  });
});
