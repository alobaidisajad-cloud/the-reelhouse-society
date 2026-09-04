/**
 * signedOutHasNoInertControls.test.tsx — the controls that looked live and were not.
 * ─────────────────────────────────────────────────────────────────────────────
 * `dispatchNoDeadControls.test.ts` requires every touchable to declare an
 * `onPress`. Every one of these did. The press was written as
 *
 *     onPress={() => onCertify?.(!certified)}
 *
 * and the screens pass `onCertify` only when there is a member — so for a
 * signed-out reader the handler was absent, the optional call swallowed it, and
 * the control rendered enabled, undimmed, announced as available, and answered
 * a press with nothing. Six of them: certify and save on a card, certify and
 * save in the reader, marking a ballot, and certifying a critique.
 *
 * That is the exact shape of defect the other guard exists to prevent, and the
 * other guard could never have seen it: a scan of the tag finds an `onPress`,
 * and what makes the control dead is one `?.` inside the arrow function.
 *
 * So this one presses things instead. Given no handler, a control must be
 * disabled and must SAY it is — not merely fail quietly.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PaperActions } from '@/src/components/dispatch/paper/PaperPost';
import { PaperBallot } from '@/src/components/dispatch/paper/PaperBallot';
import { CritiqueRow } from '@/src/components/dispatch/paper/PaperCritiques';
import { p } from '@/src/components/dispatch/paper/paperStyles';

/** sRGB relative luminance, and the ratio between two composited colours. */
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const over = (fg: number[], bg: number[], a: number) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const author = { name: 'tomasreyes', memberNo: 147, tier: 'free' as const };

describe('a control with no handler is disabled, not silent', () => {
  it('the marks under a filing', () => {
    const { getByLabelText } = render(
      <PaperActions certifyCount={9} commentCount={2} onCritique={() => {}} onShare={() => {}} />,
    );
    for (const label of ['Certify this. Members only', 'Save this. Members only']) {
      const control = getByLabelText(label);
      expect(control.props.accessibilityState.disabled).toBe(true);
    }
    // And the two that need no account are still live, because both of them
    // only open the filing — which is public to read.
    expect(getByLabelText(/^Critique\./).props.accessibilityState?.disabled).toBeFalsy();
    expect(getByLabelText('Share this filing').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('and they come back the moment a handler is given', () => {
    const marked: boolean[] = [];
    const { getByLabelText } = render(
      <PaperActions certifyCount={9} commentCount={2} onCertify={(n) => marked.push(n)} />,
    );
    const control = getByLabelText('Certify this');
    expect(control.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(control);
    expect(marked).toEqual([true]);
  });

  it('and stays VISIBLE while it is dimmed', () => {
    /**
     * A control nobody can see is not "disabled", it is missing — and the house
     * has already made this exact call once. `PaperChrome`'s note reads:
     * "Inactive labels are `bone` at 0.6 (~4.8:1), NOT `fog` at 0.45 (~2.2:1) —
     * navigation you cannot read is not navigation."
     *
     * This shipped at 0.38, which composites to 1.85:1 — below the value that
     * note rejected. Measured against the paper ground rather than eyeballed,
     * because opacity over a near-black ground is not intuitive.
     */
    const ground = over([8, 6, 4], [0x0A, 0x09, 0x06], 0.98); // p.doc over the app's ink
    const fog = [0x9E, 0x94, 0x88];
    const alpha = (p.actionOff as { opacity: number }).opacity;

    const dimmed = ratio(over(fog, ground, alpha), ground);
    // 3:1 is what a UI component needs to be perceivable.
    expect(dimmed).toBeGreaterThanOrEqual(3);
    // And still clearly the quieter of the two: a live mark is ~6.8:1.
    expect(dimmed).toBeLessThan(ratio(over(fog, ground, 1), ground) * 0.75);
  });

  it('an option on a ballot', () => {
    const { getByLabelText } = render(
      <PaperBallot
        question="What should the house watch?"
        author={author}
        options={[
          { title: 'Tokyo Story', posterPath: null, votes: 0 },
          { title: 'Late Spring', posterPath: null, votes: 0 },
        ]}
        myVote={null}
        closed={false}
        closesLabel="closes in a day"
      />,
    );
    const option = getByLabelText(/Option 1 of 2/);
    expect(option.props.accessibilityState.disabled).toBe(true);
  });

  it('the mark under a critique', () => {
    const { getByLabelText } = render(
      <CritiqueRow
        c={{
          id: 'c1', author, body: 'A critique.', certifyCount: 4,
          certified: false, age: '2H', mine: false, taken: false,
        }}
      />,
    );
    expect(
      getByLabelText('Certify this critique. Members only').props.accessibilityState.disabled,
    ).toBe(true);
  });
});
