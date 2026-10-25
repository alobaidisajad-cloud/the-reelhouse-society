import { nav } from '@/src/utils/typedRouter';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/src/components/text';
import { useAboveDockedBar, useModalTop } from '@/src/components/layout/navMetrics';

import LogForm from '@/src/components/log/LogForm';
import { st } from '@/src/components/log/LogModalStyles';
import LogSearchEngine from '@/src/components/log/LogSearchEngine';
import LogSealBar, { SEAL_BAR_HEIGHT } from '@/src/components/log/LogSealBar';
import LogAtmosphere from '@/src/components/log/LogAtmosphere';
import { RoomRetrieving, RoomUnreachable } from '@/src/components/profile/RoomParts';
import { EmptyState } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import { Arrive } from '@/src/components/Arrive';
import { ChevronLeft, X } from 'lucide-react-native';
import { e2eTrace, e2eTraceAt } from '@/src/utils/e2eTrace';

export default function LogModalScreen() {

    const { user } = useAuthStore();
    const flow = useLogFlow();
    const { isAuthenticated, step, film, isEditing, editReady, selectFilm, submitting, setStep } = flow;

    // KEYBOARD LAW (router-screen form): the ScrollView's
    // automaticallyAdjustKeyboardInsets scrolls the FOCUSED field above the
    // keyboard on iOS (the login/reset-password proven mechanism) — blind
    // container padding only made room without scrolling to it. On Android the
    // root ends at the keyboard (KeyboardRoom) and the shortened ScrollView
    // scrolls the focused field into view.
    const scrollEnd = useAboveDockedBar(SEAL_BAR_HEIGHT);
    const handleTop = useModalTop();
    // Each step the form shows, for the sealed E2E: a flow that lands on the wrong one says when.
    React.useEffect(() => { e2eTrace('log.step', { step, film: film?.id ?? null }); }, [step, film?.id]);

    // ── Not authenticated ──
    if (!isAuthenticated) {
        return (
            <Arrive name="log.identify" duration={400} style={[st.root, st.centerAuthPrompt]}>
                <Text style={st.identifyText}>Identify yourself to file records</Text>
                <PressableScale style={st.signInBtn} onPress={() => { nav.replace('/login'); }} haptic="medium" accessibilityLabel="Sign in">
                    <Text style={st.signInBtnText}>IDENTIFY YOURSELF</Text>
                </PressableScale>
            </Arrive>
        );
    }

    // ════════════════════════════════════════
    //   R E N D E R
    // ════════════════════════════════════════
    return (
        <View style={st.root}>
            <StatusBar style="light" />
            {/* The film, behind the chrome and the document alike. Fixed, so it
                stays put while the docket scrolls over it — the record's own
                parallax. Arrives after the entrance settles. */}
            {/* It hangs over the docket, whose sheet begins where it ends: an edit
                still waiting for its record has no docket, and its words sit on the ground. */}
            {editReady && step === 1 && <LogAtmosphere posterPath={film?.poster_path} />}
            <View style={st.kavFlex}>
                {/* Drag handle */}
                <View style={[st.dragHandleWrap, { paddingTop: handleTop }]}><View style={st.dragHandle} /></View>

                {/* Header */}
                <View style={[st.header, step === 1 && st.headerOnFilm]} onLayout={e2eTraceAt('log.header')}>
                    <View style={st.headerLeft}>
                        {isEditing && <View style={st.editBadge}><Text style={st.editBadgeText}>EDITING</Text></View>}
                        {step === 1 && !isEditing && (
                            <PressableScale onPress={() => { e2eTrace('log.back'); setStep(0); }} hitSlop={null} haptic="selection" style={st.backBtn} accessibilityRole="button" accessibilityLabel="Back to search">
                                <ChevronLeft size={20} color={colors.fog} strokeWidth={2.5} />
                            </PressableScale>
                        )}
                        {/* No title, at either step. The Concierge card that opens
                            this screen already says "Log a Film — set down what
                            you've seen"; repeating it here made the same invitation
                            twice in four seconds. At step 1 the docket names the
                            film. The header is chrome, never content. */}
                    </View>
                    <PressableScale onPress={() => { nav.back(); }} disabled={submitting} style={[st.closeBtn, submitting && { opacity: 0.5 }]} hitSlop={null} haptic="selection" accessibilityLabel="Close">
                        <X size={16} color={colors.fog} />
                        <Text style={st.closeBtnText}>CLOSE</Text>
                    </PressableScale>
                </View>

                {/* ════ AN EDIT, BEFORE ITS RECORD IS IN HAND ════
                    Never a blank form over a record that exists: its blanks
                    would be sealed over the record. */}
                {!editReady && (
                    <View style={st.editWait}>
                        {flow.editRead === 'failed' ? <RoomUnreachable room="your record" onRetry={flow.rereadEdit} />
                            : flow.editRead === 'withdrawn' ? <EmptyState buster="suspicious" title="No Such Record" subtitle="It was withdrawn, or it is not yours to amend." compact />
                            : <RoomRetrieving room="your record" />}
                    </View>
                )}

                {/* ════ STEP 0: SEARCH ════ */}
                {editReady && step === 0 && (
                    <LogSearchEngine onSelectFilm={selectFilm} />
                )}

                {/* ════ STEP 1: LOG FORM ════ */}
                {editReady && step === 1 && film && (
                    // The scroll must END above the docked seal, or the last index
                    // entry hides behind it. One measured number: the bar's own
                    // height plus the safe area.
                    <ScrollView style={st.formScroll} contentContainerStyle={[st.formContent, { paddingBottom: scrollEnd }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
                        <LogForm flow={flow} user={user} />
                    </ScrollView>
                )}
            </View>

            {/* The wax, on the desk from the moment you sit down. A SIBLING of
                the scroll view, never inside it — the scroll adjusts its own
                insets for the keyboard, and the bar answers the keyboard itself. */}
            {editReady && step === 1 && film && (
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

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
