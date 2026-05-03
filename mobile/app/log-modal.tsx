import React from 'react';
import {
    View, Text, ScrollView,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { colors } from '@/src/theme/theme';
import { useAuthStore } from '@/src/stores/auth';
import LogSearchEngine from '@/src/components/log/LogSearchEngine';
import LogForm from '@/src/components/log/LogForm';
import { X } from 'lucide-react-native';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { st } from '@/src/components/log/LogModalStyles';
import PressableScale from '@/src/components/PressableScale';

export default function LogModalScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const flow = useLogFlow();
    const { isAuthenticated, step, film, isEditing, selectFilm } = flow;

    const keyboard = useAnimatedKeyboard();
    const animatedKeyboardStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));

    // ── Not authenticated ──
    if (!isAuthenticated) {
        return (
            <View style={[st.root, st.centerAuthPrompt]}>
                <Text style={st.identifyText}>Identify yourself to file records</Text>
                <PressableScale style={st.signInBtn} onPress={() => { router.replace('/login' as any); }} haptic="medium">
                    <Text style={st.signInBtnText}>IDENTIFY YOURSELF</Text>
                </PressableScale>
            </View>
        );
    }

    // ════════════════════════════════════════
    //   R E N D E R
    // ════════════════════════════════════════
    return (
        <View style={st.root}>
            <Animated.View style={[st.kavFlex, animatedKeyboardStyle]}>
                {/* Drag handle */}
                <View style={st.dragHandleWrap}><View style={st.dragHandle} /></View>

                {/* Header */}
                <View style={st.header}>
                    <View style={{flex: 1, paddingRight: 16}}>
                        {isEditing && <View style={st.editBadge}><Text style={st.editBadgeText}>EDITING</Text></View>}
                        <Text style={st.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{step === 0 ? 'Log a Film' : (film?.title || 'Log')}</Text>
                    </View>
                    <PressableScale onPress={() => { router.back(); }} style={st.closeBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection">
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
                    <ScrollView style={st.formScroll} contentContainerStyle={st.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <LogForm flow={flow} user={user} />
                    </ScrollView>
                )}
            </Animated.View>
        </View>
    );
}
