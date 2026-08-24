/**
 * roomRail.test.tsx — the header row shared by the Archive and the Vault.
 *
 * A rail is `YEAR ──── LABEL  COUNT` on one line. Most labels are month names
 * or one of seven shelf formats, so it looks unbreakable — but the Vault falls
 * back to the raw `format` string off the row, and that column is capped only
 * at 5,000 characters with no whitelist. The one label on the page a member can
 * author is the one that could push the count off the screen.
 *
 * Written because a mutation pass removed the line bound and every existing
 * test still passed.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { RoomRail } from '../RoomParts';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

describe('a rail is one line, whatever reaches it', () => {
  it('renders the parts it was given', () => {
    const { getByText } = render(<RoomRail lead="2024" label="SEPTEMBER" count="12 FILMS" />);
    expect(getByText('2024')).toBeTruthy();
    expect(getByText('SEPTEMBER')).toBeTruthy();
    expect(getByText('12 FILMS')).toBeTruthy();
  });

  it('bounds the label to a single line', () => {
    // The count sits to the right of the label. A label allowed to wrap pushes
    // the row to two lines and the count out of alignment with every other rail.
    const { getByText } = render(<RoomRail label="SEPTEMBER" count="12 FILMS" />);
    expect(getByText('SEPTEMBER').props.numberOfLines).toBe(1);
  });

  it('survives a label a member could actually write', () => {
    // `formats` is member-writable, capped at 5,000 characters, no value list.
    const hostile = 'BETAMAX '.repeat(300).trim();
    const { getByText } = render(<RoomRail label={hostile} count="1 COPY" />);
    expect(getByText(hostile).props.numberOfLines).toBe(1);
    expect(getByText('1 COPY')).toBeTruthy();
  });

  it('renders without a count or a lead — the Vault case', () => {
    const { getByText, queryByText } = render(<RoomRail label="BLU-RAY" />);
    expect(getByText('BLU-RAY')).toBeTruthy();
    expect(queryByText('undefined')).toBeNull();
  });

  it('hides the rhythm bar from screen readers, since the count already says it', () => {
    // Decorative. Announcing it would just repeat the number beside it.
    const { toJSON } = render(<RoomRail label="MARCH" count="9 FILMS" weight={0.5} />);
    expect(JSON.stringify(toJSON())).toContain('no-hide-descendants');
  });

  it('omits the rhythm bar entirely when the weight is unknown', () => {
    // A rhythm drawn from partial counts is a prettier lie than a wrong number.
    const { toJSON } = render(<RoomRail label="MARCH" count="9 FILMS" />);
    expect(JSON.stringify(toJSON())).not.toContain('no-hide-descendants');
  });
});
