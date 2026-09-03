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
