/**
 * secondKey.test.ts — where the Tribunal's door stands (src/utils/secondKey.ts, WORKLIST P0.94):
 * open for a session that gave the key; a code asked for where a key is confirmed; a key to
 * register where none is, with every half-registered one named for removal; factors that are
 * not authenticator keys never count. And a code is its six digits, a secret read in fours.
 */
import { digitsOf, doorOf, groupedSecret, isWhole, type Factor } from '../secondKey';

const totp = (id: string, status: Factor['status']): Factor => ({ id, factor_type: 'totp', status });

it('opens for a session that gave the key, whatever the account holds', () => {
  expect(doorOf('aal2', [])).toEqual({ stage: 'held' });
  expect(doorOf('aal2', [totp('k', 'verified')])).toEqual({ stage: 'held' });
});

it('asks for the code of the confirmed key, never of a half-registered one', () => {
  expect(doorOf('aal1', [totp('half', 'unverified'), totp('key', 'verified')])).toEqual({ stage: 'challenge', factorId: 'key' });
  expect(doorOf(null, [totp('key', 'verified')])).toEqual({ stage: 'challenge', factorId: 'key' });
});

it('asks for a key to be registered where none is confirmed, naming each half-registered one to remove', () => {
  expect(doorOf('aal1', [])).toEqual({ stage: 'enrol', stale: [] });
  expect(doorOf('aal1', [totp('a', 'unverified'), totp('b', 'unverified')])).toEqual({ stage: 'enrol', stale: ['a', 'b'] });
  // A phone factor is no authenticator key: neither a key to ask for, nor one to remove.
  expect(doorOf('aal1', [{ id: 'p', factor_type: 'phone', status: 'verified' }])).toEqual({ stage: 'enrol', stale: [] });
});

it('reads a code as its six digits, whole at six alone, and a secret in groups of four', () => {
  expect(digitsOf(' 12-34 567 8')).toBe('123456');
  expect([isWhole('12345'), isWhole('123456')]).toEqual([false, true]);
  expect(groupedSecret('JBSWY3DPEHPK3PXPJB')).toBe('JBSW Y3DP EHPK 3PXP JB');
});
