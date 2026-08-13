import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { setSensitive } from '@/src/stores/mmkv-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import TactileEngine from '@/src/utils/TactileEngine';
import reelToast from '@/src/utils/reelToast';
import { getPasswordChecks } from '@/src/components/auth/PasswordStrengthMeter';
import { useAuthThrottle } from './useAuthThrottle';
import { AuthService } from '@/src/services/AuthService';
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
  const isInvalidCredentials = rawMsg.includes('Invalid login credentials');

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
                                      ? 'Username is already taken.'
  : rawMsg.includes('User already registered')
                                      ? 'That address is already on the register. Try signing in.'
  : /rate limit|too many requests/i.test(rawMsg)
                                      ? 'Too many attempts. The door needs a moment — try again shortly.'
  : /Refresh Token|session|JWT/i.test(rawMsg)
                                      ? 'Your session lapsed. Please identify yourself again.'
  : /network|fetch|timeout/i.test(rawMsg)
                                      ? 'The line went quiet. Check your connection and try again.'
  : rawMsg.includes('Password should be')
                                      ? 'That password is too short. Eight characters minimum.'
  : rawMsg;

  return { message, isInvalidCredentials };
}

/**
 * Which form the screen opens on, decided from the route BEFORE first paint.
 *
 * Exported so the invariant is testable without mounting the whole hook: the
 * effect that also handles `action` fires after mount, so relying on it alone
 * made the modal slide up on the wrong form and flip.
 */
export function initialIsLogin(action?: string): boolean {
  return action !== 'signup' && action !== 'resend_signup';
}

export function useAuthFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { login, signup, isAuthenticated } = useAuthStore();

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
      setForgotModalVisible(true);
    } else if (params.action === 'resend_signup') {
      setIsLogin(false);
      reelToast('Please enter your email to request a new link.');
    }
  }, [params.action]);

  // Timer cleanup removed here because it's now handled centrally above

  const checkUsernameAvailability = (value: string) => {
    const requestId = ++usernameCheckRequestId.current;
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: creds.email, password: creds.password,
      });
      if (error) {
        if (error.message.includes('Email not confirmed')) {
          reelToast.error('Your email has not been verified yet.');
        } else {
          reelToast.error(error.message);
        }
        return;
      }
      if (data?.session) {
        // Clear password from memory immediately after successful use
        credentialsRef.current.password = '';
        const profile = await AuthService.getSessionProfile(data.session.user.id);
        if (!profile) throw new Error('Profile synchronization timeout');
        const completeUser = { ...data.session.user, ...profile, following: [] } as import('@/src/types').User;
        useAuthStore.setState({ user: completeUser, isAuthenticated: true });
        try { setSensitive(`ironvault_user_cache_${completeUser.id}`, JSON.stringify(completeUser)); } catch {}
        setAwaitingConfirmation(false);
        (router.replace as any)('/(tabs)');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification check failed.';
      reelToast.error(msg);
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
      await supabase.auth.resend({ 
        type: 'signup', 
        email: confirmedEmail,
        options: {
          emailRedirectTo: Linking.createURL('auth-callback') + '?type=signup',
        }
      });
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
    } catch {
      reelToast.error('The telegraph line is disrupted. Try again.');
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
        (router.replace as any)('/(tabs)');
      } else {
        const formattedUsername = usernameCheck!.sanitized;
        const result = await signup(emailOrUsername.trim(), password, formattedUsername);
        if (result.needsConfirmation) {
          setConfirmedEmail(emailOrUsername.trim());
          setAwaitingConfirmation(true);
        } else {
          (router.replace as any)('/(tabs)');
        }
      }
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : 'Authentication failed.';
      const { message, isInvalidCredentials } = mapAuthError(rawMsg);
      if (isInvalidCredentials) recordAttempt();
      reelToast.error(message);
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  };



  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      reelToast.error('Please enter your email to request a credential reset.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: Linking.createURL('auth-callback') + '?type=recovery',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The telegraph line is down. Try again.';
      reelToast.error(msg);
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
    forgotModalVisible, setForgotModalVisible,
    forgotEmail, setForgotEmail,
    forgotLoading, forgotSent, setForgotSent,
    awaitingConfirmation, setAwaitingConfirmation, confirmedEmail, resending, resendCooldown,
    usernameStatus, pwChecks, pwStrong,
    canAttempt, secondsRemaining,
    checkUsernameAvailability, handleResend, handleLoginSubmit, handleForgotPassword, toggleMode, handleManualConfirmationCheck
  };
}
