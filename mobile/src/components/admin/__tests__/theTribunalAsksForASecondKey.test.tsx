/**
 * theTribunalAsksForASecondKey.test.tsx — the Tribunal's door (WORKLIST P0.94,
 * src/components/admin/SecondKeyDoor.tsx), against the auth server's second factors as
 * strict as the house (test-utils/supabaseFake's mfa):
 *   - a session that gave the key is let through, and nothing else is drawn;
 *   - an admin with no key registers one: the key is shown, opened in the authenticator or
 *     copied, and its first code confirms it and opens the door; a half-registered key is
 *     removed first, so the new one is not refused for its name;
 *   - an admin with a key gives its code; a wrong one is refused in words and cleared;
 *   - a check that failed says so and asks again, and is never taken for "no key".
 */
import React from 'react';
import { Linking, Text as RNText } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { supabaseFake, FAKE_SECRET, type MfaWorld } from '@/test-utils/supabaseFake';
import { REFUSED, SecondKeyDoor } from '../SecondKeyDoor';

let mockHouse = supabaseFake({ mfa: { code: '246810' } });
let r: ReturnType<typeof render>;
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }));

const KEY = { id: '00000000-0000-4000-8000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Tribunal key' } as const;
const HALF = { id: '00000000-0000-4000-8000-000000000002', factor_type: 'totp', status: 'unverified', friendly_name: 'Tribunal key' } as const;

/** A turn of the event loop, inside act: what a press set going (a check, a code given) has landed. */
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const door = async (world: MfaWorld) => {
  mockHouse = supabaseFake({ mfa: world });
  r = render(<SecondKeyDoor userId="admin"><RNText>THE DOCKET</RNText></SecondKeyDoor>);
  await settle();
};
/** The clock a press reads: each code is typed a second after the last, as a person types (a press within 400 ms is one tap, PressableScale). */
let clock = 1_000_000;
beforeEach(() => { jest.spyOn(Date, 'now').mockImplementation(() => clock); });
afterEach(() => { jest.restoreAllMocks(); });
const type = async (code: string) => {
  clock += 1000;
  await act(async () => { await fireEvent.changeText(r.getByTestId('second-key-code'), code); });
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-give')); });
  await settle();
};

it('lets through a session that gave the key, and draws nothing of the door', async () => {
  await door({ level: 'aal2', code: '246810', factors: [KEY] });
  expect(r.getByText('THE DOCKET')).toBeTruthy();
  expect(r.queryByText('The Second Key')).toBeNull();
});

it('registers a key for an admin with none: shown, opened or copied, then its first code opens the door', async () => {
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await door({ code: '246810', factors: [HALF] });
  expect(r.queryByText('THE DOCKET')).toBeNull();
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-register')); });
  // The half-registered key went first; the new one took its name.
  expect(mockHouse.mfa.asked.map((a) => a.call)).toEqual(['level', 'list', 'unenroll', 'enroll']);
  expect(r.getByText(FAKE_SECRET.match(/.{1,4}/g)!.join(' '))).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-open')); });
  expect(opened).toHaveBeenCalledWith(expect.stringMatching(/^otpauth:\/\/totp\/The%20ReelHouse%20Society:/));
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-copy')); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(FAKE_SECRET);
  await type('246810');
  expect(r.getByText('THE DOCKET')).toBeTruthy();
  expect([mockHouse.mfa.level(), mockHouse.mfa.factors().map((f) => f.status)]).toEqual(['aal2', ['verified']]);
});

it('says so when the house will not register a key, and keeps nothing', async () => {
  await door({ code: '246810', fail: { enroll: { code: 'unexpected_failure', message: 'Failed to fetch' } } });
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-register')); });
  expect(r.getByText('The house could not register a key. Nothing was kept: try again.')).toBeTruthy();
  expect(r.queryByTestId('second-key-code')).toBeNull();
});

it('asks an admin with a key for its code: a wrong one is refused in words and cleared, the right one opens the door', async () => {
  await door({ code: '246810', factors: [KEY] });
  expect(r.getByText(/Give the six figures your authenticator shows/)).toBeTruthy();
  await type('135791');
  expect(r.getByText(REFUSED.wrong)).toBeTruthy();
  expect(r.getByTestId('second-key-code').props.value).toBe('');
  expect(r.queryByText('THE DOCKET')).toBeNull();
  await type('246810');
  expect(r.getByText('THE DOCKET')).toBeTruthy();
});

it('takes only the six digits of what is typed or pasted, and gives nothing before all six', async () => {
  await door({ code: '246810', factors: [KEY] });
  await act(async () => { await fireEvent.changeText(r.getByTestId('second-key-code'), '24 68'); });
  expect(r.getByTestId('second-key-code').props.value).toBe('2468');
  await act(async () => { await fireEvent.press(r.getByTestId('second-key-give')); });
  expect(mockHouse.mfa.asked.map((a) => a.call)).toEqual(['level', 'list']);
  await act(async () => { await fireEvent.changeText(r.getByTestId('second-key-code'), '246 810 9'); });
  expect(r.getByTestId('second-key-code').props.value).toBe('246810');
});

it('says when the house never checked a code, apart from a wrong one', async () => {
  await door({ code: '246810', factors: [KEY], fail: { verify: { code: 'unexpected_failure', message: 'Failed to fetch' } } });
  await type('246810');
  expect(r.getByText(REFUSED.unchecked)).toBeTruthy();
  expect(r.queryByText('THE DOCKET')).toBeNull();
});

it('says a failed check as a failure and asks again, never taking it for an admin with no key', async () => {
  await door({ code: '246810', factors: [KEY], fail: { list: { code: 'unexpected_failure', message: 'Failed to fetch' } } });
  expect(r.getByText(/The house could not check your key/)).toBeTruthy();
  expect(r.queryByTestId('second-key-register')).toBeNull();
  mockHouse = supabaseFake({ mfa: { code: '246810', factors: [KEY] } });
  await act(async () => { await fireEvent.press(r.getByLabelText('Try again: check the key')); });
  await settle();
  expect(r.getByText(/Give the six figures your authenticator shows/)).toBeTruthy();
});
