import { nav } from '@/src/utils/typedRouter';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
    Text,
    View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LogForm from '@/src/components/log/LogForm';
import { st } from '@/src/components/log/LogModalStyles';
import LogSearchEngine from '@/src/components/log/LogSearchEngine';
import LogSealBar, { SEAL_BAR_HEIGHT } from '@/src/components/log/LogSealBar';
import PressableScale from '@/src/components/PressableScale';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import { ChevronLeft, X } from 'lucide-react-native';

export default function LogModalScreen() {

    const { user } = useAuthStore();
    const flow = useLogFlow();
    const { isAuthenticated, step, film, isEditing, selectFilm, submitting, setStep } = flow;

    // KEYBOARD LAW (router-screen form): the ScrollView's
    // automaticallyAdjustKeyboardInsets scrolls the FOCUSED field above the
    // keyboard on iOS (the login/reset-password proven mechanism) — blind
    // container padding only made room without scrolling to it. Android's
    // window resize handles everything natively.
    const insets = useSafeAreaInsets();

    // ── Not authenticated ──
    if (!isAuthenticated) {
        return (
            <Animated.View entering={FadeInDown.duration(400)} style={[st.root, st.centerAuthPrompt]}>
                <Text style={st.identifyText}>Identify yourself to file records</Text>
                <PressableScale style={st.signInBtn} onPress={() => { nav.replace('/login'); }} haptic="medium" accessibilityLabel="Sign in">
                    <Text style={st.signInBtnText}>IDENTIFY YOURSELF</Text>
                </PressableScale>
            </Animated.View>
        );
    }

    // ════════════════════════════════════════
    //   R E N D E R
    // ════════════════════════════════════════
    return (
        <View style={st.root} accessibilityViewIsModal={true}>
            <StatusBar style="light" backgroundColor="transparent" translucent />
            <View style={st.kavFlex}>
                {/* Drag handle */}
                <View style={st.dragHandleWrap}><View style={st.dragHandle} /></View>

                {/* Header */}
                <View style={st.header}>
                    <View style={st.headerLeft}>
                        {isEditing && <View style={st.editBadge}><Text style={st.editBadgeText}>EDITING</Text></View>}
                        {step === 1 && !isEditing && (
                            <PressableScale onPress={() => { setStep(0); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection" style={{ marginRight: 6, paddingRight: 4 }}>
                                <ChevronLeft size={20} color={colors.fog} strokeWidth={2.5} />
                            </PressableScale>
                        )}
                        {step === 0 && <Text style={st.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Log a Film</Text>}
                    </View>
                    <PressableScale onPress={() => { nav.back(); }} disabled={submitting} style={[st.closeBtn, submitting && { opacity: 0.5 }]} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection" accessibilityLabel="Close">
                        <X size={16} color={colors.fog} />
                        <Text style={st.closeBtnText}>CLOSE</Text>
                    </PressableScale>
                </View>

                {/* ════ STEP 0: SEARCH ════ */}
                {step === 0 && (
                    <LogSearchEngine onSelectFilm={selectFilm} />
                )}

                {/* ════ STEP 1: LOG FORM ════ */}
                {step === 1 && film && (
                    // The scroll must END above the docked seal, or the last index
                    // entry hides behind it. One measured number: the bar's own
                    // height plus the safe area, instead of the 80 + 20 + inset
                    // that had accumulated here for no stated reason.
                    <Animated.ScrollView style={st.formScroll} contentContainerStyle={[st.formContent, { paddingBottom: insets.bottom + SEAL_BAR_HEIGHT + 16 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
                        <LogForm flow={flow} user={user} />
                    </Animated.ScrollView>
                )}
            </View>

            {/* The wax, on the desk from the moment you sit down. A SIBLING of
                the scroll view, never inside it — the scroll adjusts its own
                insets for the keyboard, and the bar answers the keyboard itself. */}
            {step === 1 && film && (
                <LogSealBar
                    status={flow.status}
                    rating={flow.rating}
                    review={flow.review}
                    abandonedReason={flow.abandonedReason}
                    date={flow.date}
                    watchedWith={flow.watchedWith}
                    physicalMedia={flow.physicalMedia}
                    submitting={flow.submitting}
                    sealed={flow.sealed}
                    isEditing={isEditing}
                    onSeal={flow.handleLog}
                />
            )}
        </View>
    );
}
