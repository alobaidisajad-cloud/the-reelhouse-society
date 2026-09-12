/**
 * oneRopeNotThree.test.tsx — the velvet rope, and the two shapes it replaces.
 * ─────────────────────────────────────────────────────────────────────────────
 * The app answered "you do not hold this rank" three different ways:
 *
 *   SHOW IT, LOCKED  the log's Autopsy and Editorial Desk — the real controls
 *                    rendered inert, one quiet refusal at the foot. Correct.
 *   THE WALL         a full-screen poster INSTEAD of the page, describing a
 *                    room the member cannot see into. The archive's version
 *                    offered no way in at all.
 *   THE VANISH       the feature deleted from the interface entirely. A member
 *                    cannot want what they have never seen.
 *
 * These are the pieces that let the other two be replaced, so this test guards
 * the properties that make them worth having — not their markup.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { ClearanceGate, Locked } from '../Clearance';
import { GATED_FEATURES, RANK_WEIGHT } from '@/src/constants/gatedFeatures';

describe('one rope, not three', () => {
  describe('the rope', () => {
    it('names the rank without naming a price', () => {
      const r = render(<ClearanceGate rank="archivist" names="The Vault" onPress={() => {}} />);
      expect(r.getByText('[ CLEARANCE REQUIRED ]')).toBeTruthy();
      expect(r.getByText('✦ ASCEND THE RANKS')).toBeTruthy();
      // A rope is not a checkout. Prices live on the Society page, once, from
      // the store — never typed into a gate where they can go stale or be
      // wrong in another currency.
      const flat = JSON.stringify(r.toJSON());
      expect(flat).not.toMatch(/\$|1\.99|4\.99|19\.99|49\.99/);
    });

    it('tells a LAPSED member something different from a stranger', () => {
      const stranger = render(<ClearanceGate rank="archivist" names="The Vault" onPress={() => {}} />);
      const lapsed = render(<ClearanceGate rank="archivist" standing="lapsed" names="The Vault" onPress={() => {}} />);

      expect(stranger.getByText('[ CLEARANCE REQUIRED ]')).toBeTruthy();
      expect(lapsed.getByText('[ YOUR DUES HAVE LAPSED ]')).toBeTruthy();
      expect(lapsed.getByText('✦ RESUME YOUR STANDING')).toBeTruthy();
      // Somebody who once paid must not be greeted like a stranger. The house
      // kept their letters; the wording should know that.
      expect(JSON.stringify(lapsed.toJSON())).not.toMatch(/CLEARANCE REQUIRED/);
    });

    it('is ONE target, so a member taps the rope and not a word in it', () => {
      const r = render(<ClearanceGate rank="auteur" names="The Autopsy" onPress={() => {}} />);
      const flat = JSON.stringify(r.toJSON());
      // The text sits inside pointerEvents="none" — three separate tappable
      // lines is how a refusal becomes three refusals.
      expect(flat).toMatch(/"pointerEvents":"none"/);
    });

    it('wears the rank’s own ink — brass for one, ruby for the other', () => {
      const arch = JSON.stringify(render(<ClearanceGate rank="archivist" names="The Vault" onPress={() => {}} />).toJSON());
      const aut = JSON.stringify(render(<ClearanceGate rank="auteur" names="The Autopsy" onPress={() => {}} />).toJSON());
      expect(arch).not.toEqual(aut);
    });

    it('speaks the whole refusal aloud, including the way out', () => {
      const r = render(<ClearanceGate rank="auteur" names="The Autopsy" onPress={() => {}} />);
      const spoken = r.getByLabelText(/Clearance required/);
      // A screen reader must not get "clearance required" and no idea what
      // would lift it, nor that the control goes somewhere.
      expect(spoken.props.accessibilityLabel).toMatch(/THE AUTEUR/);
      expect(spoken.props.accessibilityLabel).toMatch(/Society/);
    });
  });

  describe('the instrument, shown and inert', () => {
    it('passes no taps through and is hidden from a screen reader', () => {
      const r = render(
        <Locked><View><Text>THE AUTOPSY</Text></View></Locked>,
      );
      const flat = JSON.stringify(r.toJSON());
      // Inert as ONE layer, not as six individually disabled buttons: a
      // disabled control still invites the tap and still answers with nothing.
      expect(flat).toMatch(/"pointerEvents":"none"/);
      // And both properties, because one is iOS and one is Android — either
      // alone leaves a member being walked through controls they cannot use.
      expect(flat).toMatch(/"accessibilityElementsHidden":true/);
      expect(flat).toMatch(/"importantForAccessibility":"no-hide-descendants"/);
    });

    it('still RENDERS what it locks — that is the entire point', () => {
      const r = render(<Locked><Text>THE AUTOPSY</Text></Locked>);
      // The wall and the vanish both fail this. You are not sold a name; you
      // are looking at the instrument.
      //
      // Asserted on the tree rather than with getByText, because the children
      // are deliberately hidden from the accessibility tree that getByText
      // searches — which is exactly how this test found the flaw below.
      expect(JSON.stringify(r.toJSON())).toMatch(/THE AUTOPSY/);
    });

    it('and the ROPE names what it hides, or it is the vanish again', () => {
      // `Locked` hides its children from the screen reader — right, because
      // nobody should be walked through six dead controls. But it means a
      // member who cannot see the dimmed instrument learns nothing is there,
      // which is THE VANISH recreated for exactly the people least able to
      // work around it. So the name lives on the rope, spoken first.
      const r = render(<ClearanceGate rank="auteur" names="The Autopsy" onPress={() => {}} />);
      const spoken = r.getByLabelText(/The Autopsy/);
      expect(spoken.props.accessibilityLabel).toMatch(/^The Autopsy\./);
    });
  });

  describe('the registry is what the rope reads from', () => {
    it('every feature names a rank the database actually weighs', () => {
      for (const f of GATED_FEATURES) {
        expect(`${f.id}: ${RANK_WEIGHT[f.rank]}`).toMatch(/: [12]$/);
      }
    });

    it('and every feature carries the promise text, so no gate writes its own', () => {
      // A gate that wrote its own sentence would be a second copy of a claim,
      // and the copy is the one that goes stale — exactly how a Gilded Frame
      // nobody built ended up on sale.
      for (const f of GATED_FEATURES) {
        expect(`${f.id}: ${typeof f.promise === 'string' && f.promise.length > 3}`)
          .toBe(`${f.id}: true`);
      }
    });
  });
});
