/**
 * theSecondKeyIsReadAsItIs.test.tsx — useSecondKey (src/hooks/useSecondKey.ts, WORKLIST P0.94)
 * against the auth server's second factors as strict as the house (test-utils/supabaseFake):
 * each refusal it can meet is handed back as what it is, and nothing it was refused is kept.
 *   - a read that failed, answered or thrown, is `failed`, never a door;
 *   - a half-registered key that will not go stops the registering, and nothing is registered;
 *   - a key the house will not register, answered or thrown, is no key;
 *   - a code: wrong (the server's own refusal), unchecked (anything else, thrown too), or taken.
 */
import { act, renderHook } from '@testing-library/react-native';
import { supabaseFake, type MfaWorld } from '@/test-utils/supabaseFake';
import { useSecondKey } from '../useSecondKey';

let mockHouse = supabaseFake({ mfa: { code: '246810' } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const KEY = { id: '00000000-0000-4000-8000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Tribunal key' } as const;
const HALF = { id: '00000000-0000-4000-8000-000000000002', factor_type: 'totp', status: 'unverified', friendly_name: 'Old key' } as const;
const NETWORK = { code: 'unexpected_failure', message: 'Failed to fetch' };

/** The hook over a world, once its first read has landed. */
const read = async (world: MfaWorld) => {
  mockHouse = supabaseFake({ mfa: world });
  const hook = await renderHook(() => useSecondKey('admin'));
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return hook.result;
};
/** A client whose mfa throws where supabase-js would hand back an error (a fault in the client itself). */
const throwing = (call: 'listFactors' | 'enroll' | 'challengeAndVerify') => {
  (mockHouse.client.auth.mfa as Record<string, unknown>)[call] = () => { throw new Error('the client broke'); };
};

it('says a read that failed, answered or thrown, as failed, never as a door', async () => {
  expect((await read({ code: '1', factors: [KEY], fail: { list: NETWORK } })).current.state).toEqual({ kind: 'failed' });
  expect((await read({ code: '1', factors: [KEY], fail: { level: NETWORK } })).current.state).toEqual({ kind: 'failed' });
  const result = await read({ code: '1', factors: [KEY] });
  expect(result.current.state).toEqual({ kind: 'door', stage: 'challenge', factorId: KEY.id });
  throwing('listFactors');
  await act(async () => { await result.current.check(); });
  expect(result.current.state).toEqual({ kind: 'failed' });
});

it('stops registering when a half-registered key will not go, and registers nothing', async () => {
  const result = await read({ code: '1', factors: [HALF], fail: { unenroll: NETWORK } });
  let made: unknown = 'not asked';
  await act(async () => { made = await result.current.enrol([HALF.id]); });
  expect(made).toBeNull();
  expect(mockHouse.mfa.asked.map((a) => a.call)).toEqual(['level', 'list', 'unenroll']);
  expect(mockHouse.mfa.factors()).toEqual([HALF]);
});

it('hands back no key when the house will not register one, answered or thrown', async () => {
  const result = await read({ code: '1', fail: { enroll: NETWORK } });
  let made: unknown = 'not asked';
  await act(async () => { made = await result.current.enrol([]); });
  expect(made).toBeNull();
  const again = await read({ code: '1' });
  throwing('enroll');
  await act(async () => { made = await again.current.enrol([]); });
  expect([made, mockHouse.mfa.factors()]).toEqual([null, []]);
});

it('hands back a new key whole: its id, the link for the authenticator and the secret', async () => {
  const result = await read({ code: '1' });
  let made: unknown;
  await act(async () => { made = await result.current.enrol([]); });
  expect(made).toEqual({ factorId: mockHouse.mfa.factors()[0]?.id, uri: expect.stringMatching(/^otpauth:\/\/totp\//), secret: expect.any(String) });
  expect(mockHouse.mfa.asked.at(-1)).toEqual({ call: 'enroll', args: { factorType: 'totp', issuer: 'The ReelHouse Society', friendlyName: 'Tribunal key' } });
});

it('says of a code: wrong, unchecked (thrown too), or taken, and a taken one opens the door', async () => {
  const result = await read({ code: '246810', factors: [KEY] });
  let said: unknown;
  await act(async () => { said = await result.current.give(KEY.id, '111111'); });
  expect(said).toBe('wrong');
  const unchecked = await read({ code: '246810', factors: [KEY], fail: { verify: NETWORK } });
  await act(async () => { said = await unchecked.current.give(KEY.id, '246810'); });
  expect(said).toBe('unchecked');
  const broken = await read({ code: '246810', factors: [KEY] });
  throwing('challengeAndVerify');
  await act(async () => { said = await broken.current.give(KEY.id, '246810'); });
  expect(said).toBe('unchecked');
  const taken = await read({ code: '246810', factors: [KEY] });
  await act(async () => { said = await taken.current.give(KEY.id, '246810'); });
  expect([said, taken.current.state]).toEqual([null, { kind: 'door', stage: 'held' }]);
});
