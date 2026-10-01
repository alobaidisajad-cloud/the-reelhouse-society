import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { BAD_CREDENTIALS, authLink } from '@/src/utils/authSignals';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';
import reelToast from '@/src/utils/reelToast';
import { getPasswordChecks } from '@/src/components/auth/PasswordStrengthMeter';
import { useAuthThrottle } from './useAuthThrottle';
import { validateUsername } from '@/src/utils/validateUsername';

export interface LoginSubmissionInput {
  isLogin: boolean;
  emailOrUsername: string;
  password: string;
  username: string;
  canAttempt: boolean;
  secondsRemaining: number;
  pwStrong: boolean;
  usernameStatus: 'idle' | 'checking' | 'available' | 'taken';
  usernameCheck: { valid: boolean; error?: string } | null;
}

// Returns a user-facing block message, or null if the form can be submitted.
// Order matters: each gate matches the exact check handleLoginSubmit used to
// run inline, so the earliest applicable reason is always the one returned.
export function validateLoginSubmission(input: LoginSubmissionInput): string | null {
  const { isLogin, emailOrUsername, password, username, canAttempt, secondsRemaining, pwStrong, usernameStatus, usernameCheck } = input;
  if (!emailOrUsername || !password || (!isLogin && !username)) {
    return 'All fields are required for clearance.';
  }
  if (isLogin && !canAttempt) {
    return `Credentials suspended. Retry in ${secondsRemaining}s.`;
  }
  if (!isLogin && !pwStrong) {
    return 'Your cipher does not meet Society encryption standards.';
  }
  if (usernameCheck && !usernameCheck.valid) {
    return usernameCheck.error ?? 'That handle is not allowed.';
  }
  if (!isLogin && usernameStatus === 'taken') {
    return 'That handle is already claimed by another patron.';
  }
  return null;
}

// Maps a raw Supabase/auth error message to its user-facing copy.
// isInvalidCredentials tells the caller whether to record a throttle attempt.
export function mapAuthError(rawMsg: string): { message: string; isInvalidCredentials: boolean } {
  const isInvalidCredentials = rawMsg.includes(BAD_CREDENTIALS);

  // Every test reads rawMsg, never the partly-rewritten value. The first draft
  // of this chain tested `message`, so each branch was matching against
  // whatever an earlier branch had already substituted — harmless with today's
  // strings, but it meant adding a pattern that happened to appear in one of
  // the replacements would silently double-map. Anything unmatched still falls
  // through verbatim, so a genuinely new Supabase signal is never swallowed.
  //
  // Before this, unmapped errors were shown as-is: a member could meet
  // "AuthApiError: Invalid Refresh Token: Refresh Token Not Found" inside a
  // 1924 members' club.
  const message =
    isInvalidCredentials              ? 'Identity not recognized. Check your credentials.'
  : rawMsg.includes('Database error saving new user')
                                      ? 'The register could not take your details just now. Try again.'
  : rawMsg.includes('User already registered')
                                      ? 'That address is already on the register. Try signing in.'
  : rawMsg.includes('Email not confirmed')
                                      ? 'Your address is not confirmed yet. Open the link we sent, then try again.'
  : /link is invalid or has expired|otp_expired|token has expired/i.test(rawMsg)
                                      ? 'This link has expired or was already used. Ask for a new one.'
  : /code verifier/i.test(rawMsg)
                                      ? 'This link belongs to the phone that asked for it. An address it confirmed is confirmed: sign in. For a new password, ask for a fresh link here.'
  : /rate limit|too many requests|for security purposes|only request this after/i.test(rawMsg)
                                      ? 'Too many attempts. The door needs a moment — try again shortly.'
  : /Refresh Token|session|JWT/i.test(rawMsg)
                                      ? 'Your session lapsed. Please identify yourself again.'
  : /network|fetch|timeout/i.test(rawMsg)
                                      ? 'The line went quiet. Check your connection and try again.'
  : rawMsg.includes('service unavailable')
                                      ? 'The door could not answer just now. Try again shortly.'
  : rawMsg.includes('Password should be')
                                      ? 'That password is too short. Eight characters minimum.'
  : rawMsg;

  return { message, isInvalidCredentials };
}

/** A thrown or answered refusal's words, whatever shape it came in ('' if none). */
function messageOf(err: unknown): string {
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? m : '';
}

/**
 * Which form the screen opens on, decided from the route BEFORE first paint.
 *
 * Exported so the invariant is testable without mounting the whole hook: the
 * effect that also handles `action` fires after mount, so relying on it alone
 * made the modal slide up on the wrong form and flip.
 */
export function initialIsLogin(action?: string): boolean {
  return action !== 'signup';
}

/** What the email-link sheet sends: a password reset, or a fresh confirmation. */
export type EmailLinkPurpose = 'reset' | 'confirm';

export function useAuthFlow() {
  const params = useLocalSearchParams<{ action?: string }>();
  const { login, signup } = useAuthStore();

  // Seeded from the route, not defaulted to true. The effect below cannot do
  // this job alone: it fires AFTER mount, so a member tapping SEEK ADMISSION
  // would watch the modal slide up showing "Enter The House" and the sign-in
  // form, then flip to "Join The Society" with the username field animating
  // in under LinearTransition. Render one is now already correct, and the
  // effect remains for the case it actually handles — the param CHANGING on a
  // screen that is already mounted (auth-callback and reset-password both
  // router.replace into this route).
  const [isLogin, setIsLogin] = useState(() => initialIsLogin(params.action));
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [linkPurpose, setLinkPurpose] = useState<EmailLinkPurpose>('reset');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const { canAttempt, recordAttempt, secondsRemaining } = useAuthThrottle();

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameCheckRequestId = useRef(0);
  const credentialsRef = useRef({ email: '', password: '' });

  const pwChecks = getPasswordChecks(password);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const pwStrong = pwPassed === 5;

  const isMounted = useRef(true);
  useEffect(() => {
    return () => { 
      isMounted.current = false; 
      if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    };
  }, []);

  useEffect(() => {
    credentialsRef.current = { email: emailOrUsername, password };
  }, [emailOrUsername, password]);

  // `signup` and `login` are the two the GATE sends. They did not exist here,
  // which is why passing the param alone would have fixed nothing: the handler
  // only knew the two deep-link actions below, and the form fell through to its
  // isLogin=true default either way. `login` matters as much as `signup` —
  // without it, opening signup and then tapping "Already a member?" would land
  // on whichever mode happened to be left over.
  useEffect(() => {
    if (params.action === 'signup') {
      setIsLogin(false);
    } else if (params.action === 'login') {
      setIsLogin(true);
    } else if (params.action === 'forgot_password') {
      setIsLogin(true);
      setLinkPurpose('reset');
      setForgotModalVisible(true);
    } else if (params.action === 'resend_signup') {
      // A fresh confirmation asks only for the address, not the whole sign-up form.
      setIsLogin(true);
      setLinkPurpose('confirm');
      setForgotModalVisible(true);
    }
  }, [params.action]);

  const checkUsernameAvailability = (value: string) => {
    const requestId = ++usernameCheckRequestId.current;
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    // The handle that would be claimed (validateUsername's), not the one as typed:
    // "John.Doe" is claimed as "johndoe", and that is the one to look up.
    const trimmed = validateUsername(value).sanitized;
    if (trimmed.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    usernameCheckTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', trimmed)
          .maybeSingle();
        if (error) throw error;
        if (requestId === usernameCheckRequestId.current) {
          setUsernameStatus(data ? 'taken' : 'available');
        }
      } catch {
        if (requestId === usernameCheckRequestId.current) {
          setUsernameStatus('idle');
        }
      }
    }, 500);
  };

  const handleManualConfirmationCheck = async () => {
    if (submitting || !credentialsRef.current.email || !credentialsRef.current.password) return;
    setSubmitting(true);
    try {
      const creds = credentialsRef.current;
      // The same sign-in as the form's, so this door sets up everything it does.
      await login(creds.email, creds.password);
      credentialsRef.current.password = '';
      setAwaitingConfirmation(false);
      nav.replace('/(tabs)');
    } catch (err: unknown) {
      const raw = messageOf(err);
      reelToast.error(raw ? mapAuthError(raw).message : 'Verification check failed.');
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  };

  useEffect(() => {
    // Clear credentials from memory on unmount
    return () => { credentialsRef.current = { email: '', password: '' }; };
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    TactileEngine.success();
    try {
      // A refusal is ANSWERED (supabase-js resolves it): read it, or the
      // member is told of an email that never went.
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: confirmedEmail,
        options: {
          emailRedirectTo: authLink('signup'),
        },
      });
      if (error) throw error;
      reelToast.success('A new cipher has been wired to your inbox.');
      setResendCooldown(60);
      cooldownRef.current = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const raw = messageOf(err);
      reelToast.error(raw ? mapAuthError(raw).message : 'The telegraph line is disrupted. Try again.');
    } finally {
      if (isMounted.current) setResending(false);
    }
  };

  const handleLoginSubmit = async () => {
    // Single source of truth for handle rules (length, charset, reserved
    // words, profanity, underscore placement). Enforced here at signup so the
    // server never has to reject a malformed handle after the fact.
    const usernameCheck = isLogin ? null : validateUsername(username);
    const blockReason = validateLoginSubmission({
      isLogin, emailOrUsername, password, username, canAttempt, secondsRemaining, pwStrong, usernameStatus, usernameCheck,
    });
    if (blockReason) { reelToast.error(blockReason); return; }
    if (submitting) return;
    setSubmitting(true);
    TactileEngine.mutate();

    try {
      if (isLogin) {
        await login(emailOrUsername.trim(), password);
        nav.replace('/(tabs)');
      } else {
        const formattedUsername = usernameCheck!.sanitized;
        const result = await signup(emailOrUsername.trim(), password, formattedUsername);
        if (result.needsConfirmation) {
          setConfirmedEmail(emailOrUsername.trim());
          setAwaitingConfirmation(true);
        } else {
          nav.replace('/(tabs)');
        }
      }
    } catch (error: unknown) {
      const rawMsg = messageOf(error) || 'Authentication failed.';
      const { message, isInvalidCredentials } = mapAuthError(rawMsg);
      if (isInvalidCredentials) recordAttempt();
      reelToast.error(message);
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  };



  const handleEmailLink = async () => {
    const email = forgotEmail.trim();
    if (!email) {
      reelToast.error(linkPurpose === 'reset'
        ? 'Please enter your email to request a credential reset.'
        : 'Please enter the email you joined with.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = linkPurpose === 'reset'
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: authLink('recovery') })
        : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authLink('signup') } });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      const raw = messageOf(err);
      reelToast.error(raw ? mapAuthError(raw).message : 'The telegraph line is down. Try again.');
    } finally {
      if (isMounted.current) setForgotLoading(false);
    }
  };

  const toggleMode = () => {
    TactileEngine.navigate();
    setIsLogin(v => !v);
    setEmailOrUsername('');
    setPassword('');
    setUsername('');
    setUsernameStatus('idle');
  };

  return {
    isLogin, setIsLogin,
    emailOrUsername, setEmailOrUsername,
    password, setPassword,
    username, setUsername,
    submitting,
    showPassword, setShowPassword,
    forgotModalVisible, setForgotModalVisible, linkPurpose, setLinkPurpose,
    forgotEmail, setForgotEmail,
    forgotLoading, forgotSent, setForgotSent,
    awaitingConfirmation, setAwaitingConfirmation, confirmedEmail, resending, resendCooldown,
    usernameStatus, pwChecks, pwStrong,
    canAttempt, secondsRemaining,
    checkUsernameAvailability, handleResend, handleLoginSubmit, handleEmailLink, toggleMode, handleManualConfirmationCheck
  };
}
