/**
 * aCritiqueIsWithdrawnOrReported.test.tsx — one control at a critique's foot,
 * in the house's own words, the same under a log, in a stack and on a filing.
 * ─────────────────────────────────────────────────────────────────────────────
 *   YOURS says WITHDRAW, and asks first: a critique cannot be put back, and a
 *   log's came off the page on a single tap.
 *   ANYONE ELSE'S says REPORT, in plain sight (its sheet can also block); it was
 *   a long press few members would ever find.
 *   A FORMER MEMBER'S says nothing: there is nobody left to report.
 *   NOTHING HOLDS A CONTROL: the whole row was a long press, and to a screen
 *   reader one element — the author's name and the member's own control inside
 *   it could not be reached.
 */
import React, { act } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { CritiqueRow, type Critique } from '../CritiqueRow';
import { askToWithdrawCritique, WITHDRAW_BODY, WITHDRAW_TITLE } from '../withdraw';

const critique = (over: Partial<Critique> = {}): Critique => ({
  id: 'c1', user_id: 'u-author', username: 'marguerite', avatar_url: null,
  body: 'Cold is not unfeeling.', created_at: '2026-09-30T12:00:00Z', ...over,
});
const draw = (c: Critique, me: string | undefined, handlers: { onWithdraw?: jest.Mock; onReport?: jest.Mock } = {}) =>
  render(
    <CritiqueRow c={c} currentUserId={me} onPressUser={jest.fn()}
      onWithdraw={handlers.onWithdraw ?? jest.fn()} onReport={handlers.onReport} />,
  );
const isControl = (n: TestInstance) => n.props.accessibilityRole === 'button' || n.props.accessibilityRole === 'link';

describe('yours', () => {
  it('says WITHDRAW, and asks before anything comes off the page', async () => {
    const onWithdraw = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const r = draw(critique({ user_id: 'me' }), 'me', { onWithdraw, onReport: jest.fn() });
    expect(r.queryByLabelText(/^Report this critique/)).toBeNull();
    await act(async () => { await fireEvent.press(r.getByLabelText('Withdraw your critique')); });
    expect(onWithdraw).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(WITHDRAW_TITLE, WITHDRAW_BODY, expect.any(Array));
    const [keep, yes] = alert.mock.calls[0][2] as AlertButton[];
    alert.mockRestore();
    expect([keep.text, keep.style, yes.text, yes.style]).toEqual(['Keep it', 'cancel', 'Withdraw', 'destructive']);
    await act(async () => { keep.onPress?.(); });
    expect(onWithdraw).not.toHaveBeenCalled();
    await act(async () => { yes.onPress?.(); });
    expect(onWithdraw).toHaveBeenCalledWith('c1');
  });
});

describe('anyone else’s', () => {
  it('says REPORT in plain sight, and it opens the report with the critique', async () => {
    const onReport = jest.fn();
    const r = draw(critique(), 'me', { onReport });
    expect(r.queryByLabelText('Withdraw your critique')).toBeNull();
    await act(async () => { await fireEvent.press(r.getByLabelText('Report this critique by @marguerite')); });
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', user_id: 'u-author' }));
  });

  it('a reader not signed in is offered no REPORT (there is no report to file)', () => {
    const r = draw(critique(), undefined);
    expect(r.queryByLabelText(/^Report this critique/)).toBeNull();
    expect(r.queryByLabelText('Withdraw your critique')).toBeNull();
  });

  it('a former member’s says nothing — there is nobody left to report', () => {
    const r = draw(critique({ user_id: null, username: 'a former member' }), 'me', { onReport: jest.fn() });
    expect(r.queryByLabelText(/^Report this critique/)).toBeNull();
    expect(r.queryByLabelText('Withdraw your critique')).toBeNull();
  });
});

describe('every control can be reached', () => {
  it('the row is not a control, and no control is held inside another', () => {
    for (const [c, me] of [[critique({ user_id: 'me' }), 'me'], [critique(), 'me']] as const) {
      const r = draw(c, me, { onReport: jest.fn() });
      const controls = r.container.queryAll(isControl);
      // the byline and the one foot control, side by side in the tree
      expect(controls.map((n) => n.props.accessibilityLabel)).toEqual([
        'View profile of @' + c.username, me === c.user_id ? 'Withdraw your critique' : `Report this critique by @${c.username}`,
      ]);
      for (const n of controls) expect(n.queryAll((m) => m !== n && isControl(m))).toEqual([]);
      r.unmount();
    }
  });
});

describe('the one question', () => {
  it('is asked the same way wherever a critique is withdrawn', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const withdraw = jest.fn();
    askToWithdrawCritique(withdraw);
    expect(alert).toHaveBeenCalledWith('Withdraw this critique?', 'It comes off the page. This cannot be undone.', expect.any(Array));
    alert.mockRestore();
  });
});
