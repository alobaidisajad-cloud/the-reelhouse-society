/**
 * SecondKeyDoor — the Tribunal's door: an admin passes it once this session has given
 * the second key (WORKLIST P0.94; src/utils/secondKey.ts says why it stands).
 *
 * The door draws one of four rooms: the key being checked; a check that failed (said as
 * a failure, with a way to ask again); a key to register (the authenticator opened from
 * here, or the key typed by hand, then its first code confirms it); or a code to give.
 * Once the session holds the second key, the Tribunal itself is drawn.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { Text, TextInput } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import TryAgain from '@/src/components/TryAgain';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { useContentBottom, usePushedHeaderTop } from '@/src/components/layout/navMetrics';
import { useStateSaid } from '@/src/hooks/useStateSaid';
import { useSecondKey, type CodeRefusal, type NewKey } from '@/src/hooks/useSecondKey';
import { SUPPORT_EMAIL } from '@/src/constants/support';
import { colors, fonts } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { WASH } from '@/src/theme/light';
import { digitsOf, groupedSecret, isWhole, KEY_DIGITS } from '@/src/utils/secondKey';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';

/** What a refused code says. */
export const REFUSED: Record<CodeRefusal, string> = {
  wrong: 'Those figures are not the key’s. A code lasts thirty seconds: give the one showing now.',
  unchecked: 'The house could not check the code. Nothing was taken: try again.',
};

export function SecondKeyDoor({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { state, check, enrol, give } = useSecondKey(userId);
  if (state.kind === 'door' && state.stage === 'held') return <>{children}</>;
  return (
    <Room>
      {state.kind === 'checking' && <Checking />}
      {state.kind === 'failed' && <Failed onRetry={() => { void check(); }} />}
      {state.kind === 'door' && state.stage === 'enrol' && <Register stale={state.stale} enrol={enrol} give={give} />}
      {state.kind === 'door' && state.stage === 'challenge' && <Challenge factorId={state.factorId} give={give} />}
    </Room>
  );
}

function Room({ children }: { children: React.ReactNode }) {
  const top = usePushedHeaderTop();
  const bottom = useContentBottom();
  return (
    <View style={s.container}>
      <RoomLight room="default" />
      <LinearGradient colors={['rgba(180,45,45,0.10)', colors.ink]} style={[StyleSheet.absoluteFill, WASH]} />
      <ScrollView contentContainerStyle={[s.page, { paddingTop: top, paddingBottom: bottom }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <PressableScale onPress={() => nav.back()} style={s.backBtn} haptic="selection" pressedScale={0.92} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={20} color={colors.bone} />
        </PressableScale>
        <KeyRound size={28} color={colors.crimson} style={s.mark} />
        <Text style={s.eyebrow}>THE TRIBUNAL’S DOOR</Text>
        <Text style={s.title} accessibilityRole="header">The Second Key</Text>
        {children}
      </ScrollView>
    </View>
  );
}

function Checking() {
  return (
    <View style={s.block} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.sepia} />
      <Text style={s.body}>The door is checking your key.</Text>
    </View>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  useStateSaid('failed', 'second key');
  return (
    <View style={s.block}>
      <Text style={s.body}>The house could not check your key, so the door stays shut. Nothing about your key has changed.</Text>
      <TryAgain onPress={onRetry} accessibilityLabel="Check the key again" style={s.retry} />
    </View>
  );
}

/** The six figures, as an authenticator shows them, and the act that gives them. */
function CodeField({ act, label, give, factorId }: {
  act: string;
  label: string;
  factorId: string;
  give: (factorId: string, code: string) => Promise<CodeRefusal | null>;
}) {
  const [code, setCode] = useState('');
  const [giving, setGiving] = useState(false);
  const [refused, setRefused] = useState<CodeRefusal | null>(null);
  const submit = async () => {
    if (!isWhole(code) || giving) return;
    setGiving(true);
    const why = await give(factorId, code);
    // A refused code is cleared, for the next one; the door opens on its own when it is taken.
    if (why) { setRefused(why); setCode(''); setGiving(false); }
  };
  return (
    <View style={s.block}>
      {!!refused && <Text style={s.fail} accessibilityLiveRegion="polite">{REFUSED[refused]}</Text>}
      <TextInput
        testID="second-key-code"
        style={s.code}
        value={code}
        onChangeText={(t) => { setCode(digitsOf(t)); if (refused) setRefused(null); }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={KEY_DIGITS}
        placeholder="000000"
        placeholderTextColor={colors.fog}
        selectionColor={colors.selection}
        editable={!giving}
        accessibilityLabel={label}
        onSubmitEditing={() => { void submit(); }}
      />
      <PressableScale
        testID="second-key-give"
        style={[s.primary, !isWhole(code) && UNREADY.plate]}
        onPress={() => { void submit(); }}
        disabled={!isWhole(code) || giving}
        haptic="medium"
        accessibilityRole="button"
        accessibilityState={{ disabled: !isWhole(code) || giving, busy: giving }}
        accessibilityLabel={act}
      >
        <Text style={[s.primaryText, !isWhole(code) && UNREADY.words]}>{giving ? 'CHECKING…' : act.toUpperCase()}</Text>
      </PressableScale>
    </View>
  );
}

function Challenge({ factorId, give }: { factorId: string; give: (factorId: string, code: string) => Promise<CodeRefusal | null> }) {
  return (
    <>
      <Text style={s.body}>Give the six figures your authenticator shows for The ReelHouse Society. This session keeps the key until you sign out.</Text>
      <CodeField act="Open the Tribunal" label="Six figure code from your authenticator" factorId={factorId} give={give} />
      <Text style={s.small}>Lost the phone that holds your key? Write to the front desk, {SUPPORT_EMAIL}, from the address on your account.</Text>
    </>
  );
}

function Register({ stale, enrol, give }: {
  stale: string[];
  enrol: (stale: readonly string[]) => Promise<NewKey | null>;
  give: (factorId: string, code: string) => Promise<CodeRefusal | null>;
}) {
  const [key, setKey] = useState<NewKey | null>(null);
  const [making, setMaking] = useState(false);
  const [refused, setRefused] = useState(false);
  const make = async () => {
    setMaking(true);
    setRefused(false);
    const made = await enrol(stale);
    setMaking(false);
    if (made) setKey(made); else setRefused(true);
  };
  if (!key) {
    return (
      <>
        <Text style={s.body}>The Tribunal acts on other members’ words and accounts, so it asks for a second key: a code from an authenticator app, on top of your password. Register one now; you will give its code each time you sign in.</Text>
        {refused && <Text style={s.fail} accessibilityLiveRegion="polite">The house could not register a key. Nothing was kept: try again.</Text>}
        <PressableScale testID="second-key-register" style={s.primary} onPress={() => { void make(); }} disabled={making} haptic="medium" accessibilityRole="button" accessibilityState={{ disabled: making, busy: making }} accessibilityLabel="Register a key">
          <Text style={s.primaryText}>{making ? 'REGISTERING…' : 'REGISTER A KEY'}</Text>
        </PressableScale>
      </>
    );
  }
  const open = async () => {
    const opened = await Linking.openURL(key.uri).then(() => true, () => false);
    if (!opened) reelToast.info('No authenticator on this phone took the key: type it by hand below.');
  };
  const copy = async () => {
    await Clipboard.setStringAsync(key.secret);
    reelToast.success('The key is copied.');
  };
  return (
    <>
      <Text style={s.body}>Give the key to your authenticator app, then give the code it shows to confirm it.</Text>
      <PressableScale testID="second-key-open" style={s.secondary} onPress={() => { void open(); }} haptic="selection" accessibilityRole="button" accessibilityLabel="Open the key in your authenticator">
        <Text style={s.secondaryText}>OPEN IN YOUR AUTHENTICATOR</Text>
      </PressableScale>
      <Text style={s.small}>Or type it by hand, as a time-based key:</Text>
      <Text testID="second-key-secret" style={s.secret} selectable accessibilityLabel={`The key: ${key.secret.split('').join(' ')}`}>{groupedSecret(key.secret)}</Text>
      <PressableScale testID="second-key-copy" style={s.secondary} onPress={() => { void copy(); }} haptic="selection" accessibilityRole="button" accessibilityLabel="Copy the key">
        <Text style={s.secondaryText}>COPY THE KEY</Text>
      </PressableScale>
      <CodeField act="Confirm the key" label="Six figure code your authenticator shows for the new key" factorId={key.factorId} give={give} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  page: { paddingHorizontal: 20, gap: 16 },
  backBtn: { alignSelf: 'flex-start', padding: 8, marginLeft: -8 },
  mark: { marginTop: 8 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.crimsonInk },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.bone },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.fog },
  fail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.crimsonInk },
  block: { gap: 12 },
  retry: { alignSelf: 'flex-start' },
  code: { backgroundColor: colors.well, borderWidth: 1, borderColor: colors.ash, color: colors.parchment, fontFamily: fonts.body, fontSize: 24, padding: 16, borderRadius: 4, textAlign: 'center', letterSpacing: 8 },
  secret: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26, letterSpacing: 2, color: colors.parchment },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bloodReel, borderWidth: 1, borderColor: 'transparent', borderRadius: 4, paddingHorizontal: 16 },
  primaryText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.bone },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.sepia, borderRadius: 4, paddingHorizontal: 16 },
  secondaryText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia },
});
