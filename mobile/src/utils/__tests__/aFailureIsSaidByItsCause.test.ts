/**
 * saidOfAFailure: an act that failed is told by why it failed, never all one way.
 */
import { saidOfAFailure } from '@/src/utils/saidOfARefusal';

const ACT = 'The note could not be removed.';

describe('a failure is said by its cause', () => {
  it('the member\'s standing, in the house\'s own words', () => {
    expect(saidOfAFailure({ code: '42501', message: 'Your account has been silenced by The Society.' }, ACT))
      .toBe('Your account has been silenced by The Society.');
  });

  it('the connection, and a way to try again, only when it was the network', () => {
    expect(saidOfAFailure(new TypeError('Network request failed'), ACT)).toBe(`${ACT} Check your connection and try again.`);
    expect(saidOfAFailure({ code: '40001', message: 'could not serialize access' }, ACT)).toBe(`${ACT} Check your connection and try again.`);
  });

  it('a refusal the house made on purpose, never as the connection: its rule, and its pace', () => {
    expect(saidOfAFailure({ code: '42501', message: 'new row violates row-level security policy' }, ACT)).toBe(`${ACT} The house did not allow it.`);
    expect(saidOfAFailure({ code: 'RH429', message: 'RATE_LIMITED', details: 'member', hint: '30' }, ACT, 'Too quick.')).toBe('Too quick.');
  });

  it('any other failure, the act alone: trying again would not mend it', () => {
    expect(saidOfAFailure({ code: 'P0001', message: 'List not found' }, ACT)).toBe(ACT);
    expect(saidOfAFailure(undefined, ACT)).toBe(ACT);
  });
});
