import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore, storage } from '@/src/stores/auth';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import reelToast from '@/src/utils/reelToast';
import { getPasswordChecks } from '@/src/components/auth/PasswordStrengthMeter';

export function useAuthFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const { login, signup, isAuthenticated } = useAuthStore();

  const [isLogin, setIsLogin] = useState(true);
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
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const credentialsRef = useRef({ email: '', password: '' });

  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 30000;

  const pwChecks = getPasswordChecks(password);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const pwStrong = pwPassed === 5;

  useEffect(() => {
    credentialsRef.current = { email: emailOrUsername, password };
  }, [emailOrUsername, password]);

  useEffect(() => {
    if (params.action === 'forgot_password') {
      setIsLogin(true);
      setForgotModalVisible(true);
    } else if (params.action === 'resend_signup') {
      setIsLogin(false);
      reelToast('Please enter your email to request a new link.');
    }
  }, [params.action]);

  useEffect(() => {
    return () => { if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current); };
  }, []);

  const checkUsernameAvailability = (value: string) => {
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
        setUsernameStatus(data ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  };

  useEffect(() => {
    if (!awaitingConfirmation || isAuthenticated) return;
    const { email, password: pw } = credentialsRef.current;
    if (!email || !pw) return;
    
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60; // ~10 minutes with backoff

    // H-05 AUDIT FIX: Exponential backoff to reduce API pressure at scale
    const getInterval = (n: number) => {
      if (n < 5) return 3000;   // First 5: every 3s
      if (n < 15) return 5000;  // Next 10: every 5s
      if (n < 30) return 10000; // Next 15: every 10s
      return 15000;             // Remainder: every 15s
    };

    const scheduleNext = () => {
      if (cancelled || attempts >= maxAttempts || useAuthStore.getState().isAuthenticated) return;
      const delay = getInterval(attempts);
      setTimeout(async () => {
        if (cancelled || useAuthStore.getState().isAuthenticated) return;
        attempts++;
        try {
          const creds = credentialsRef.current;
          const { data, error } = await supabase.auth.signInWithPassword({
            email: creds.email, password: creds.password,
          });
          if (!error && data?.session) {
            if (cancelled) return;
            // #14 AUDIT FIX: Clear password from memory immediately after successful use
            credentialsRef.current.password = '';
            let profile = null;
            for (let attempt = 0; attempt < 10; attempt++) {
              const { data: p } = await supabase
                .from('profiles')
                .select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at')
                .eq('id', data.session.user.id)
                .maybeSingle();
              if (p) { profile = p; break; }
              await new Promise(r => setTimeout(r, 500));
            }
            if (!profile) throw new Error('Profile synchronization timeout');
            const completeUser = { ...data.session.user, ...profile, following: [] } as import('@/src/types').User;
            useAuthStore.setState({ user: completeUser, isAuthenticated: true });
            try { storage.set(`ironvault_user_cache_${completeUser.id}`, JSON.stringify(completeUser)); } catch {}
            setAwaitingConfirmation(false);
            router.replace('/(tabs)');
            return;
          }
        } catch { /* silently retry */ }
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    // #14 AUDIT FIX: Clear credentials from memory on unmount
    return () => { cancelled = true; credentialsRef.current = { email: '', password: '' }; };
  }, [awaitingConfirmation, isAuthenticated, router]);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await supabase.auth.resend({ type: 'signup', email: confirmedEmail });
      reelToast('A new cipher has been wired to your inbox.');
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
      setResending(false);
    }
  };

  const handleLoginSubmit = async () => {
    if (!emailOrUsername || !password || (!isLogin && !username)) {
      reelToast('All fields are required for clearance.');
      return;
    }
    const now = Date.now();
    if (isLogin && now < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - now) / 1000);
      reelToast(`Credentials suspended. Retry in ${remaining}s.`);
      return;
    }
    if (!isLogin && !pwStrong) {
      reelToast('Your cipher does not meet Society encryption standards.');
      return;
    }
    if (!isLogin) {
      const formatted = username.trim().toLowerCase().replace(/\s+/g, '_');
      if (!/^[a-z0-9_]+$/.test(formatted)) {
        reelToast('Handle may only contain letters, numbers, and underscores.');
        return;
      }
    }
    if (!isLogin && usernameStatus === 'taken') {
      reelToast('That handle is already claimed by another patron.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (isLogin) {
        await login(emailOrUsername.trim(), password);
        setLoginAttempts(0);
        router.replace('/(tabs)');
      } else {
        const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        if (formattedUsername.length < 3) {
          reelToast('Handle must be at least 3 characters.');
          setSubmitting(false);
          return;
        }
        const result = await signup(emailOrUsername.trim(), password, formattedUsername);
        if (result.needsConfirmation) {
          setConfirmedEmail(emailOrUsername.trim());
          setAwaitingConfirmation(true);
        } else {
          router.replace('/(tabs)');
        }
      }
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : 'Authentication failed.';
      let msg = rawMsg;
      if (msg.includes('Database error saving new user')) msg = 'Username is already taken.';
      if (msg.includes('Invalid login credentials')) {
        setLoginAttempts(prev => prev + 1);
        if (loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
          setLoginAttempts(0);
          msg = 'Too many failed attempts. Credentials suspended for 30 seconds.';
        } else {
          msg = 'Identity not recognized. Check your credentials.';
        }
      }
      reelToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // H-06 AUDIT FIX: Rate limit OAuth — prevent multiple browser sessions
  const oauthCooldownRef = useRef(0);
  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (submitting) return;
    const now = Date.now();
    if (now < oauthCooldownRef.current) return;
    oauthCooldownRef.current = now + 3000; // 3s cooldown between OAuth attempts
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const redirectUri = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });
      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (res.type === 'success') {
          let session = null;
          // #2 AUDIT FIX: Extended polling window to 15 attempts (7.5s) for slow networks
          for (let attempt = 0; attempt < 15; attempt++) {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session) { session = sessionData.session; break; }
            await new Promise(r => setTimeout(r, 500));
          }
          if (session) {
            let profile = null;
            for (let attempt = 0; attempt < 10; attempt++) {
              const { data: p } = await supabase
                .from('profiles')
                .select('id, username, role, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at')
                .eq('id', session.user.id)
                .maybeSingle();
              if (p) { profile = p; break; }
              await new Promise(r => setTimeout(r, 500));
            }
            if (!profile) throw new Error('Profile synchronization timeout');
            const completeUser = { ...session.user, ...profile, following: [] } as import('@/src/types').User;
            useAuthStore.setState({ user: completeUser, isAuthenticated: true });
            try { storage.set(`ironvault_user_cache_${completeUser.id}`, JSON.stringify(completeUser)); } catch {}
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/(tabs)');
            return;
          } else {
            // #2 AUDIT FIX: User feedback when session polling exhausts
            reelToast.error('Session verification timed out. Please try again.');
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. The booth is dark.';
      reelToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      reelToast('Please enter your email to request a credential reset.');
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
      setForgotLoading(false);
    }
  };

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    checkUsernameAvailability, handleResend, handleLoginSubmit, handleOAuth, handleForgotPassword, toggleMode
  };
}
