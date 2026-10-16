/**
 * anAddressIsToldFromAHandle.test.ts — utils/authSignals.ts: what was typed into "email or username"
 * is an address only when all of it is one (something before the @, a dotted domain after it), its
 * edges' spaces aside; and an email's link back into the app names its kind.
 */
import { authLink, isAddress } from '../authSignals';

jest.mock('expo-linking', () => ({
  createURL: (path: string, opts?: { queryParams?: Record<string, string> }) =>
    `reelhouse://${path}${opts?.queryParams ? `?${new URLSearchParams(opts.queryParams).toString()}` : ''}`,
}));

it('takes a whole address as one, its edges\' spaces aside', () => {
  expect(isAddress('member@reelhouse.co')).toBe(true);
  expect(isAddress('  member@reelhouse.co  ')).toBe(true);
  expect(isAddress('first.last@mail.example.org')).toBe(true);
});

it('takes a handle as a handle, however much it looks like an address', () => {
  expect(isAddress('@name')).toBe(false);
  expect(isAddress('old@handle')).toBe(false);
  expect(isAddress('name')).toBe(false);
  expect(isAddress('')).toBe(false);
});

it('takes nothing as an address that only holds one: all of it must be the address', () => {
  expect(isAddress('say member@reelhouse.co')).toBe(false);
  expect(isAddress('member@reelhouse.co please')).toBe(false);
  expect(isAddress('a b@reelhouse.co')).toBe(false);
});

it('names the kind of email in its link back, to the one place that reads it', () => {
  expect(authLink('signup')).toBe('reelhouse://auth-callback?type=signup');
  expect(authLink('recovery')).toBe('reelhouse://auth-callback?type=recovery');
});
