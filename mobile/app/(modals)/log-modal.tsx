import { nav } from '@/src/utils/typedRouter';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
    Platform,
    Text,
    View,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LogForm from '@/src/components/log/LogForm';
import { st } from '@/src/components/log/LogModalStyles';
import LogSearchEngine from '@/src/components/log/LogSearchEngine';
import PressableScale from '@/src/components/PressableScale';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import { ChevronLeft, X } from 'lucide-react-native';

export default function LogModalScreen() {

    const { user } = useAuthStore();
    const flow = useLogFlow();
    const { isAuthenticated, step, film, isEditing, selectFilm, submitting, setStep } = flow;

    const keyboard = useAnimatedKeyboard();
    const animatedKeyboardStyle = useAnimatedStyle(() => ({ paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0 }));
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
            <Animated.View style={[st.kavFlex, animatedKeyboardStyle]}>
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
                        <Text style={st.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{step === 0 ? 'Log a Film' : (film?.title || 'Log')}</Text>
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
                    <Animated.ScrollView style={st.formScroll} contentContainerStyle={[st.formContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                        <LogForm flow={flow} user={user} />
                    </Animated.ScrollView>
                )}
            </Animated.View>
        </View>
    );
}
