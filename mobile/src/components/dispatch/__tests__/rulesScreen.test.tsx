/**
 * rulesScreen.test.tsx — the rules had to be reachable before they were rules.
 * ─────────────────────────────────────────────────────────────────────────────
 * Nine clauses telling a member what the house will do, on a page nothing in
 * the app opened. `everyRuleIsTrue.test.ts` checked that each clause was HONEST
 * and could not check the thing that mattered more: that anybody could read it.
 *
 * Two of these tests exist because the obvious version of this screen fails
 * them:
 *
 *   IT SCROLLS. The design plate draws the same two components with no scroll
 *   view, because a plate is one screenful by definition. Nine clauses do not
 *   fit one at the accessibility text size, and the last two clauses and the
 *   date under them would simply not exist.
 *
 *   THE DOOR IS REAL. A screen with no way in is the same as no screen. The
 *   picker — the sheet every filing passes through — carries the line, and this
 *   asserts the line presses through to the route rather than merely existing.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import RulesScreen from '@/app/dispatch/rules';
import { PaperPicker, CLAUSES } from '@/src/components/dispatch/paper/PaperMore';

const mockPushed: string[] = [];
const mockBack = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: {
    push: (path: string) => { mockPushed.push(path); },
    replace: jest.fn(),
    back: () => mockBack(),
  },
}));

beforeEach(() => { mockPushed.length = 0; mockBack.mockClear(); });

describe('the house rules', () => {
  it('prints every clause, numeral and all', async () => {
    const { getByText } = render(<RulesScreen />);
    await act(async () => { await Promise.resolve(); });

    for (const [numeral, text] of CLAUSES) {
      expect(`${numeral}: ${!!getByText(numeral)}`).toMatch(/true$/);
      // The clause itself, not merely its number — a page of numerals over an
      // empty column would pass a numeral-only check.
      expect(`${numeral} text: ${!!getByText(text)}`).toMatch(/true$/);
    }
    expect(getByText('IN FORCE SINCE 1924')).toBeTruthy();
  });

  it('scrolls, so the last clause exists', async () => {
    // Nine clauses come to roughly 655pt at the system size and more at ×1.35;
    // the screen is 740. Without a scroll view the ninth clause — the one that
    // says who may file a dossier — is off the bottom of the page for ever.
    const r = render(<RulesScreen />);
    await act(async () => { await Promise.resolve(); });

    /** Every node in the rendered tree, host and composite alike. */
    const nodes: { type: unknown; props: Record<string, unknown> }[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { type?: unknown; props?: Record<string, unknown>; children?: unknown };
      if (node.type) nodes.push({ type: node.type, props: node.props ?? {} });
      walk(node.children);
    };
    walk(r.toJSON());

    const scroll = nodes.find((n) => String(n.type).includes('ScrollView'));
    expect(`a scroll view exists: ${!!scroll}`).toMatch(/true$/);
    // And the content grows to fill a short page, so the document reaches the
    // foot rather than ending in mid-air over raw ink.
    expect(JSON.stringify(scroll!.props.contentContainerStyle)).toContain('flexGrow');
  });

  it('goes back', async () => {
    const { getByLabelText } = render(<RulesScreen />);
    await act(async () => { fireEvent.press(getByLabelText('Back')); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('is reachable — the picker carries the door', async () => {
    const onRules = jest.fn();
    const { getByLabelText } = render(<PaperPicker onRules={onRules} />);
    await act(async () => { fireEvent.press(getByLabelText('Read the house rules')); });
    expect(onRules).toHaveBeenCalled();
  });

  it('and the picker without a door does not draw a dead line', async () => {
    // The prop is optional so the mockup generator can mount the picker with
    // nothing behind it. Optional must mean ABSENT, not present-and-inert.
    const { queryByLabelText } = render(<PaperPicker />);
    expect(queryByLabelText('Read the house rules')).toBeNull();
  });
});
