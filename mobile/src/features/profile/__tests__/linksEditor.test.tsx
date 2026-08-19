/**
 * linksEditor.test.tsx — the remove control's geometry.
 *
 * A 14pt × with 4pt of padding was a 22pt control: under Apple's 44 and under
 * Android's 48. It carried a 15pt halo, which made it comfortable for a finger
 * and did nothing at all for either platform's accessibility layer — hitSlop
 * lives inside React Native's own touch dispatch and never reaches the bounds a
 * screen reader or an accessibility scanner reads.
 *
 * It also could not simply grow in place: a child only receives touches its
 * PARENT's bounds contain, and the header row it lived in was 22pt tall. So it
 * hangs off the card instead, where the whole 48pt box is live.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { LinksEditor } from '../LinksEditor';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/ControlledInput', () => ({
  ControlledInput: (props: any) => {
    const React = require('react');
    const { TextInput } = require('react-native');
    return React.createElement(TextInput, props);
  },
}));

const LINKS = [
  { id: 'a', title: 'Portfolio', url: 'https://one.example' },
  { id: 'b', title: 'Blog', url: 'https://two.example' },
];

const mount = () => render(
  <LinksEditor links={LINKS} handleAddLink={jest.fn()} handleRemoveLink={jest.fn()} errors={{}} />,
);

const removeButtons = (r: ReturnType<typeof mount>) => r.getAllByLabelText('Remove link');

describe('the remove control clears the floor by its own geometry', () => {
  it('is 48 × 48 — the bounds are the only thing accessibility can see', () => {
    for (const btn of removeButtons(mount())) {
      const s = StyleSheet.flatten(btn.props.style) as { width: number; height: number };
      expect(s.width).toBeGreaterThanOrEqual(48);
      expect(s.height).toBeGreaterThanOrEqual(48);
    }
  });

  it('needs no halo, so it can take nothing from anything', () => {
    for (const btn of removeButtons(mount())) expect(btn.props.hitSlop).toBeNull();
  });

  it('hangs off the card, because a 22pt row could not deliver a 48pt target', () => {
    // Positioned absolutely so its parent is the card, not the header row —
    // a child only receives touches its parent's bounds contain.
    const s = StyleSheet.flatten(removeButtons(mount())[0].props.style) as { position: string };
    expect(s.position).toBe('absolute');
  });

  it('there is one per link, and it removes that link', () => {
    const handleRemoveLink = jest.fn();
    const r = render(
      <LinksEditor links={LINKS} handleAddLink={jest.fn()} handleRemoveLink={handleRemoveLink} errors={{}} />,
    );
    const btns = r.getAllByLabelText('Remove link');
    expect(btns).toHaveLength(LINKS.length);
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(btns[1]);
    expect(handleRemoveLink).toHaveBeenCalledWith(1);
  });
});
