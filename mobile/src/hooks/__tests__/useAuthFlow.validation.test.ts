/**
 * useAuthFlow.validation.test.ts — Pure Logic Tests
 * ────────────────────────────────────────────────────────
 * Tests validateLoginSubmission (the gate chain handleLoginSubmit runs
 * before calling login/signup) and mapAuthError (the raw-error -> copy
 * mapping in the catch block), both extracted as pure functions.
 */
import { validateLoginSubmission, mapAuthError, LoginSubmissionInput } from '../useAuthFlow';

function baseInput(overrides: Partial<LoginSubmissionInput> = {}): LoginSubmissionInput {
  return {
    isLogin: true,
    emailOrUsername: 'me@reel.app',
    password: 'password123',
    username: '',
    canAttempt: true,
    secondsRemaining: 0,
    pwStrong: true,
    usernameStatus: 'idle',
    usernameCheck: null,
    ...overrides,
  };
}

describe('validateLoginSubmission', () => {
  it('blocks when email/username is missing', () => {
    expect(validateLoginSubmission(baseInput({ emailOrUsername: '' }))).toBe('All fields are required for clearance.');
  });

  it('blocks when password is missing', () => {
    expect(validateLoginSubmission(baseInput({ password: '' }))).toBe('All fields are required for clearance.');
  });

  it('blocks signup when username is missing, but not login', () => {
    expect(validateLoginSubmission(baseInput({ isLogin: false, username: '' }))).toBe('All fields are required for clearance.');
    expect(validateLoginSubmission(baseInput({ isLogin: true, username: '' }))).toBeNull();
  });

  it('blocks login when throttled, with the remaining seconds in the message', () => {
    expect(validateLoginSubmission(baseInput({ isLogin: true, canAttempt: false, secondsRemaining: 42 })))
      .toBe('Credentials suspended. Retry in 42s.');
  });

  it('does not apply the throttle gate to signup', () => {
    expect(validateLoginSubmission(baseInput({ isLogin: false, username: 'newuser', canAttempt: false, pwStrong: true })))
      .toBeNull();
  });

  it('blocks signup with a weak password', () => {
    expect(validateLoginSubmission(baseInput({ isLogin: false, username: 'newuser', pwStrong: false })))
      .toBe('Your cipher does not meet Society encryption standards.');
  });

  it('does not apply the password-strength gate to login', () => {
    expect(validateLoginSubmission(baseInput({ isLogin: true, pwStrong: false }))).toBeNull();
  });

  it('blocks signup with an invalid username, surfacing the validator error', () => {
    expect(validateLoginSubmission(baseInput({
      isLogin: false, username: 'a', pwStrong: true,
      usernameCheck: { valid: false, error: 'Too short.' },
    }))).toBe('Too short.');
  });

  it('falls back to a generic message when the username validator has no error text', () => {
    expect(validateLoginSubmission(baseInput({
      isLogin: false, username: 'a', pwStrong: true,
      usernameCheck: { valid: false },
    }))).toBe('That handle is not allowed.');
  });

  it('blocks signup when the username is already taken', () => {
    expect(validateLoginSubmission(baseInput({
      isLogin: false, username: 'cinephile1', pwStrong: true,
      usernameCheck: { valid: true }, usernameStatus: 'taken',
    }))).toBe('That handle is already claimed by another patron.');
  });

  it('allows a fully valid signup through', () => {
    expect(validateLoginSubmission(baseInput({
      isLogin: false, username: 'cinephile1', pwStrong: true,
      usernameCheck: { valid: true }, usernameStatus: 'available',
    }))).toBeNull();
  });

  it('allows a fully valid login through', () => {
    expect(validateLoginSubmission(baseInput())).toBeNull();
  });
});

describe('mapAuthError', () => {
  it('maps a duplicate-signup database error to a friendly message', () => {
    const result = mapAuthError('Database error saving new user: duplicate key');
    expect(result.message).toBe('Username is already taken.');
    expect(result.isInvalidCredentials).toBe(false);
  });

  it('maps invalid login credentials and flags the throttle attempt', () => {
    const result = mapAuthError('Invalid login credentials');
    expect(result.message).toBe('Identity not recognized. Check your credentials.');
    expect(result.isInvalidCredentials).toBe(true);
  });

  // These used to fall through and be shown VERBATIM, so a member could meet
  // "AuthApiError: Invalid Refresh Token: Refresh Token Not Found" inside a
  // 1924 members' club. Network failure was the case this suite originally
  // pinned as passthrough; it is now mapped, deliberately.
  it.each([
    ['Network request failed', 'The line went quiet. Check your connection and try again.'],
    ['User already registered', 'That address is already on the register. Try signing in.'],
    ['Email rate limit exceeded', 'Too many attempts. The door needs a moment — try again shortly.'],
    ['Invalid Refresh Token: Refresh Token Not Found', 'Your session lapsed. Please identify yourself again.'],
  ])('speaks in the house voice for "%s"', (raw, expected) => {
    const result = mapAuthError(raw);
    expect(result.message).toBe(expected);
    expect(result.isInvalidCredentials).toBe(false);
  });

  // Passthrough still holds for anything genuinely novel — the mapping is a
  // list of known cases, not a catch-all that would swallow a new signal.
  it('passes through an error it has never seen', () => {
    const result = mapAuthError('Teapot refused the brew');
    expect(result.message).toBe('Teapot refused the brew');
    expect(result.isInvalidCredentials).toBe(false);
  });
});
