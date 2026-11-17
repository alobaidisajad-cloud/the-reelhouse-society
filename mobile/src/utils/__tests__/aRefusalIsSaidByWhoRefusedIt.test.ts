/**
 * A REFUSAL IS SAID BY WHO REFUSED IT (review round 9, saidOfARefusal).
 *
 * 42501 is two refusals: the other member's rule (who may certify their work, who may annotate
 * their critiques) and the member's own standing (silenced, suspended: enforce_not_restricted).
 * One sentence for both told a suspended member that the author limited them, and a certification
 * the author's rule kept said "Failed to certify". The standing's refusal is said in the house's
 * own words; another 42501 is the owner's rule; anything else keeps its old words.
 */
import { isRefusedOnPurpose, saidOfARefusal } from '../saidOfARefusal';

const OWNERS_RULE = 'This member limits who may certify their work.';
const OTHERWISE = 'Failed to certify entry.';
const said = (e: unknown) => saidOfARefusal(e, OWNERS_RULE, OTHERWISE);

const SILENCED = { code: '42501', message: 'Your account has been silenced by The Society.' };
const SUSPENDED = { code: '42501', message: 'Your account is suspended until 30 Nov 2026 12:00 UTC.' };
const POLICY = { code: '42501', message: 'new row violates row-level security policy for table "interactions"' };

describe('the sentence a refused write is said in', () => {
  it('a silenced member is told the house silenced them, never that the author limits them', () => {
    expect(said(SILENCED)).toBe('Your account has been silenced by The Society.');
  });

  it('a suspended member is told until when, in the house’s own words', () => {
    expect(said(SUSPENDED)).toBe('Your account is suspended until 30 Nov 2026 12:00 UTC.');
  });

  it('the house’s words are said without the space the wire left around them', () => {
    expect(said({ ...SILENCED, message: '  Your account has been silenced by The Society.\n' }))
      .toBe('Your account has been silenced by The Society.');
  });

  it('any other refusal by a rule is the owner’s rule, not "Failed to certify"', () => {
    expect(said(POLICY)).toBe(OWNERS_RULE);
    expect(said({ status: 403, message: 'Forbidden' })).toBe(OWNERS_RULE);
  });

  it('words that only begin as the house’s sentence are no standing: the owner’s rule is said', () => {
    expect(said({ code: '42501', message: 'Your account has been silenced by The Society, says the note.' })).toBe(OWNERS_RULE);
  });

  it('anything else keeps its old words', () => {
    expect(said({ code: '23514', message: 'violates check constraint' })).toBe(OTHERWISE);
    expect(said(new Error('boom'))).toBe(OTHERWISE);
    expect(said(null)).toBe(OTHERWISE);
    expect(said(undefined)).toBe(OTHERWISE);
  });

  it('a refusal made on purpose is told apart from a defect (not sent to Sentry)', () => {
    expect(isRefusedOnPurpose(POLICY)).toBe(true);
    expect(isRefusedOnPurpose(SILENCED)).toBe(true);
    expect(isRefusedOnPurpose({ code: '23514', message: 'violates check constraint' })).toBe(false);
    expect(isRefusedOnPurpose(null)).toBe(false);
  });
});
