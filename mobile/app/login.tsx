import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { supabase } from '@/src/lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';


const AnimatedView = Animated.createAnimatedComponent(View);

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { login, signup } = useAuthStore();

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

  const handleSubmit = async () => {
    if (!emailOrUsername || !password || (!isLogin && !username)) {
      Alert.alert('Missing Fields', 'Please fill all fields.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    try {
      if (isLogin) {
        await login(emailOrUsername.trim(), password);
        router.back();
      } else {
        const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        if (formattedUsername.length < 3) {
          Alert.alert('Invalid Username', 'Username must be at least 3 characters.');
          setSubmitting(false);
          return;
        }
        const result = await signup(emailOrUsername.trim(), password, formattedUsername);
        if (result.needsConfirmation) {
          Alert.alert('Check Your Inbox', 'We sent a verification link to your email. Confirm it, then sign in.', [
            { text: 'OK', onPress: () => setIsLogin(true) },
          ]);
        } else {
          router.back();
        }
      }
    } catch (error: any) {
      let msg = error?.message || 'Authentication failed.';
      if (msg.includes('Database error saving new user')) msg = 'Username is already taken.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const redirectUri = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      
      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (res.type === 'success') {
           // We rely on supabase auth listener or explicitly call getSessionFromUrl if needed.
           // Since PKCE is default, Supabase handles the code exchange usually via deep link intercept.
        }
      }
    } catch (err: any) {
      Alert.alert('OAuth Error', err.message || 'Failed to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address to reset your password.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'reelhouse://reset-password',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send reset link.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Close */}
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>

        {/* Header */}
        <AnimatedView entering={FadeInDown.duration(800)} style={s.header}>

          <Text style={s.eyebrow}>{isLogin ? 'RETURNING PATRON' : 'NEW MEMBER'}</Text>
          <Text style={s.title}>{isLogin ? 'Enter\nThe House' : 'Join\nThe Society'}</Text>
          <View style={s.rule} />
          {isLogin && <Text style={s.subtitle}>The House remembers its own.</Text>}
        </AnimatedView>

        {/* Form */}
        <AnimatedView entering={FadeInDown.duration(600).delay(300)} style={s.form}>
          <View>
            <Text style={s.inputLabel}>{isLogin ? 'EMAIL OR USERNAME' : 'EMAIL'}</Text>
            <TextInput
              style={s.input}
              placeholder={isLogin ? 'patron@cinema.org' : 'your@email.com'}
              placeholderTextColor={colors.fog}
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              autoCapitalize="none"
              keyboardType={isLogin ? 'default' : 'email-address'}
              selectionColor={colors.sepia}
            />
          </View>

          {!isLogin && (
            <View>
              <Text style={s.inputLabel}>USERNAME / HANDLE</Text>
              <TextInput
                style={s.input}
                placeholder="your_handle"
                placeholderTextColor={colors.fog}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                selectionColor={colors.sepia}
              />
            </View>
          )}

          <View>
            <Text style={s.inputLabel}>PASSWORD</Text>
            <View style={s.passwordWrap}>
              <TextInput
                style={[s.input, { paddingRight: 60, marginBottom: 0 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.fog}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                selectionColor={colors.sepia}
              />
              <TouchableOpacity style={s.showBtn} onPress={() => setShowPassword(v => !v)}>
                <Text style={s.showText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={s.submitText}>
              {submitting ? 'THREADING...' : isLogin ? '✦ ENTER THE HOUSE' : '✦ CLAIM YOUR SEAT'}
            </Text>
          </TouchableOpacity>

          <View style={s.dividerWrap}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>OR</Text>
            <View style={s.dividerLine} />
          </View>

          <View style={s.oauthWrap}>
            <TouchableOpacity 
              style={[s.oauthBtn, submitting && s.submitDisabled]} 
              onPress={() => handleOAuth('apple')}
              disabled={submitting}
            >
              <Text style={s.oauthIcon}></Text>
              <Text style={s.oauthText}>CONTINUE WITH APPLE</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.oauthBtn, submitting && s.submitDisabled]} 
              onPress={() => handleOAuth('google')}
              disabled={submitting}
            >
              <Text style={s.oauthIcon}>G</Text>
              <Text style={s.oauthText}>CONTINUE WITH GOOGLE</Text>
            </TouchableOpacity>
          </View>

        </AnimatedView>

        {/* Toggle */}
        <AnimatedView entering={FadeInUp.duration(600).delay(500)} style={s.toggleWrap}>
          <TouchableOpacity onPress={() => setIsLogin(v => !v)}>
            <Text style={s.toggleText}>
              {isLogin ? "Don't have a seat? Join the Society" : 'Already a patron? Sign in'}
            </Text>
          </TouchableOpacity>
        </AnimatedView>
      </ScrollView>

      {/* ── Forgot Password Modal ── */}
      <Modal visible={forgotModalVisible} transparent animationType="fade" onRequestClose={() => setForgotModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setForgotModalVisible(false)} />
          <View style={s.modalContent}>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setForgotModalVisible(false)}>
              <Text style={s.modalCloseText}>✕</Text>
            </TouchableOpacity>
            
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}><Text style={s.modalIcon}>🔒</Text></View>
              <Text style={s.modalEyebrow}>CREDENTIAL RECOVERY</Text>
              <Text style={s.modalTitle}>{forgotSent ? 'Check Your Inbox' : 'Reset Password'}</Text>
            </View>

            {forgotSent ? (
               <View>
                 <Text style={s.modalBodyText}>We sent a password reset link to <Text style={{color: colors.parchment}}>{forgotEmail}</Text>.</Text>
                 <Text style={s.modalSubText}>Check your spam folder if it doesn't arrive within 2 minutes.</Text>
                 <TouchableOpacity style={s.modalSubmitBtn} onPress={() => { setForgotModalVisible(false); setForgotSent(false); }}>
                   <Text style={s.modalSubmitText}>BACK TO SIGN IN</Text>
                 </TouchableOpacity>
               </View>
            ) : (
               <View style={{ gap: 16 }}>
                 <Text style={s.modalBodyText}>Enter the email associated with your account and we'll send you a classified reset link.</Text>
                 <TextInput
                    style={s.input}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.fog}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={colors.sepia}
                  />
                  <TouchableOpacity style={[s.modalSubmitBtn, forgotLoading && s.submitDisabled]} onPress={handleForgotPassword} disabled={forgotLoading}>
                    <Text style={s.modalSubmitText}>{forgotLoading ? 'SENDING...' : 'SEND RESET LINK'}</Text>
                  </TouchableOpacity>
               </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },

  closeBtn: { position: 'absolute', top: 56, right: 0, zIndex: 10, padding: 8 },
  closeText: { color: colors.fog, fontSize: 20, fontFamily: fonts.ui },

  header: { alignItems: 'center', marginBottom: 36 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  // Web: display font lineHeight 1 = matches fontSize
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.parchment, textAlign: 'center', lineHeight: 34 },
  rule: { width: 50, height: 1, backgroundColor: colors.sepia, marginVertical: 14, opacity: 0.5 },
  subtitle: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone },

  form: { gap: 16 },
  inputLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 6 },
  // Web: inputs borderRadius var(--radius-card) = 2px
  input: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
    borderRadius: 2, padding: 15, fontSize: 14,
    fontFamily: fonts.body, color: colors.parchment,
  },
  passwordWrap: { position: 'relative' },
  showBtn: { position: 'absolute', right: 14, top: 16 },
  showText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.sepia },

  // Web: submit button borderRadius matching global standard
  submitBtn: {
    backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontFamily: fonts.uiMedium, fontSize: 12, letterSpacing: 2, color: colors.ink, fontWeight: '700' },

  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.ash },
  dividerText: { fontFamily: fonts.uiMedium, color: colors.fog, fontSize: 10, marginHorizontal: 16, letterSpacing: 1 },

  oauthWrap: { gap: 12 },
  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.ash,
    borderRadius: 2, paddingVertical: 14,
  },
  oauthIcon: { fontSize: 16, color: colors.parchment, marginRight: 12, marginTop: Platform.OS === 'ios' ? -2 : 0 },
  oauthText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 1, color: colors.bone, fontWeight: '600' },

  toggleWrap: { alignItems: 'center', marginTop: 24 },
  toggleText: { fontFamily: fonts.body, color: colors.fog, fontSize: 12, textDecorationLine: 'underline' },
  forgotPasswordText: { fontFamily: fonts.ui, color: colors.fog, fontSize: 9, letterSpacing: 1, textDecorationLine: 'underline' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 3, 1, 0.95)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.ink, borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 2, padding: 24, shadowColor: colors.sepia, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalCloseBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8 },
  modalCloseText: { color: colors.fog, fontSize: 16, fontFamily: fonts.ui },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: colors.sepia, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalIcon: { fontSize: 20 },
  modalEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 8 },
  modalTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, textAlign: 'center' },
  modalBodyText: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
  modalSubText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog, textAlign: 'center', marginBottom: 20 },
  modalSubmitBtn: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, alignItems: 'center' },
  modalSubmitText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
});
