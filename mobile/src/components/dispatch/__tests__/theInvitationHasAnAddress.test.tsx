/**
 * theInvitationHasAnAddress.test.tsx — BALLOT and ESSAY lead somewhere now.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Dispatch's picker showed the two Auteur forms on purpose — "a form you
 * can see and cannot use is an invitation" — and then made them `disabled`. A
 * member touched BALLOT and nothing happened. It was also the only place a
 * member could learn ballots existed, and the Society page never sold them:
 * the database has refused a ballot below the Auteur since the Dispatch
 * opened, and the Auteur's list said only "Publish Essays".
 *
 * Pinned here: the locked rows take the tap and name where it leads; the
 * picker ropes each form's OWN feature; both writing desks read a refusal to
 * the member without dropping the promise that their words are kept.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PaperPicker, FORMS } from '../paper/PaperMore';

const ROOT = join(__dirname, '..', '..', '..', '..');
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const lockedForms = FORMS.map((f) => ({ ...f, locked: !!f.locked }));

describe('the invitation has an address', () => {
  describe('the picker', () => {
    it('a locked form takes the tap and hands it on — it is no longer a dead row', async () => {
      const onLocked = jest.fn();
      const onPick = jest.fn();
      const r = render(<PaperPicker forms={lockedForms} onPick={onPick} onLocked={onLocked} />);
      await fireEvent.press(r.getByLabelText(/^BALLOT\./));
      await fireEvent.press(r.getByLabelText(/^ESSAY\./));
      expect(onLocked.mock.calls.map((c) => c[0])).toEqual(['ballot', 'dossier']);
      // A locked form is never filed as if it were open.
      expect(onPick).not.toHaveBeenCalled();
    });

    it('and says where it leads, in the rope’s words', () => {
      const r = render(<PaperPicker forms={lockedForms} onLocked={jest.fn()} />);
      expect(r.getByLabelText(
        'BALLOT. Put a question to the house. Two to six films. Clearance required. The Auteur opens this. Opens the Society.',
      )).toBeTruthy();
    });

    it('a lapsed member hears that their dues lapsed', () => {
      const r = render(<PaperPicker forms={lockedForms} onLocked={jest.fn()} lockedStanding="lapsed" />);
      expect(r.getByLabelText(/^BALLOT\. .* Your dues have lapsed\. The Auteur opens this again\./)).toBeTruthy();
    });

    it('an open form still files, untouched by any of this', async () => {
      const onPick = jest.fn();
      const r = render(<PaperPicker forms={lockedForms} onPick={onPick} onLocked={jest.fn()} />);
      await fireEvent.press(r.getByLabelText(/^TAKE\./));
      expect(onPick).toHaveBeenCalledWith('take');
    });

    it('without a rope to hand it to, a locked row stays inert rather than lying', async () => {
      // A preview or a caller that has not wired the rope must not make a
      // locked form look filable.
      const onPick = jest.fn();
      const r = render(<PaperPicker forms={lockedForms} onPick={onPick} />);
      const ballot = r.getByLabelText(/^BALLOT\. Auteurs only\./);
      expect(ballot.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(ballot);
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  describe('the writing room wires it to the right feature', () => {
    const compose = code('app/dispatch/compose.tsx');
    const picker = compose.slice(compose.indexOf('function KindPicker'), compose.indexOf('function ComposeDossierScreen'));

    it('each locked form ropes its OWN feature, so the Society knows which was reached for', () => {
      expect(picker).toMatch(/useClearance\('essays', '\/dispatch\/compose'\)/);
      expect(picker).toMatch(/useClearance\('ballots', '\/dispatch\/compose'\)/);
      expect(picker).toMatch(/onLocked=\{\(k\) => \(k === 'ballot' \? ballots\.open\(\) : essays\.open\(\)\)\}/);
      expect(picker).toMatch(/locked: f\.locked \? !holds\(f\.kind\) : false/);
      // The bare rank check this replaced.
      expect(picker).not.toMatch(/isAuteurPlusTier/);
    });

    it('the essay desk asks the same registry its rope asks — one answer, not two', () => {
      expect(compose).toMatch(/const canWrite = essay\.held;/);
      expect(compose).not.toMatch(/isAuteurPlusTier/);
    });
  });

  describe('a refusal at either desk keeps the promise that the words are kept', () => {
    it('the essay desk: the house’s sentence AND "Your words are kept."', () => {
      const compose = code('app/dispatch/compose.tsx');
      const at = compose.indexOf("also: 'Your words are kept.'");
      expect(at).toBeGreaterThan(-1);
      const generic = compose.indexOf("'It did not go. Your words are kept.'");
      // The door is tried FIRST, and never when the phone is out of space —
      // the one case where the words are not safe.
      expect(at).toBeLessThan(generic);
      expect(compose).toMatch(/if \(!saveFailed && showTierDoor\(err, \{/);
    });

    it('the ballot desk: the house’s sentence AND "Your question is kept."', () => {
      const desks = code('src/components/dispatch/ComposeDesks.tsx');
      const door = desks.indexOf("also: 'Your question is kept.'");
      expect(door).toBeGreaterThan(-1);
      expect(door).toBeLessThan(desks.indexOf("'The ballot could not be opened. Your question is kept.'"));
    });
  });

  describe('what is enforced is sold', () => {
    it('the Auteur’s list sells ballots, on both clients, in one sentence', () => {
      const line = 'Publish Essays & Open\\nBallots in The Dispatch';
      expect(readFileSync(join(ROOT, 'src/constants/membership.ts'), 'utf8')).toContain(`'${line}'`);
      expect(readFileSync(join(ROOT, '..', 'src/pages/MembershipPage.tsx'), 'utf8')).toContain(`'${line}'`);
    });
  });
});
