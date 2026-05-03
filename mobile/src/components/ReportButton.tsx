/**
 * ReportButton — Content reporting with reason selection.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

const REPORT_REASONS = [
    'Spam or misleading',
    'Harassment or hate speech',
    'Inappropriate content',
    'Copyright violation',
    'Impersonation',
    'Other',
];

interface ReportButtonProps {
    targetId: string;
    targetType: 'review' | 'list' | 'user' | 'log';
    size?: number;
}

export default function ReportButton({ targetId, targetType, size = 14 }: ReportButtonProps) {
    const { user } = useAuthStore();
    const [visible, setVisible] = useState(false);
    const [selectedReason, setSelectedReason] = useState('');
    const [details, setDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!selectedReason || !user) return;
        setSubmitting(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            await supabase.from('reports').insert({
                reporter_id: user.id,
                content_id: targetId,
                content_type: targetType,
                reason: selectedReason,
                details: details.trim() || null,
            });
            reelToast.success('Report submitted. The Society moderators will review this.');
            setVisible(false);
            setSelectedReason(''); setDetails('');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to submit report.';
            reelToast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PressableScale onPress={() => setVisible(true)} style={s.triggerBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light">
                <Text style={s.triggerText}>⚑</Text>
            </PressableScale>

            <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
                <View style={s.overlay}>
                    <View style={s.card}>
                        <View style={s.header}>
                            <Text style={s.title}>Report Content</Text>
                            <PressableScale onPress={() => setVisible(false)} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light">
                                <Text style={s.closeText}>✕</Text>
                            </PressableScale>
                        </View>

                        <Text style={s.label}>SELECT REASON</Text>
                        {REPORT_REASONS.map(reason => (
                            <PressableScale
                                key={reason}
                                style={[s.reasonBtn, selectedReason === reason && s.reasonActive]}
                                onPress={() => { setSelectedReason(reason); }}
                                haptic="selection"
                            >
                                <Text style={[s.reasonText, selectedReason === reason && s.reasonTextActive]}>{reason}</Text>
                            </PressableScale>
                        ))}

                        <Text style={[s.label, s.labelWithGap]}>ADDITIONAL DETAILS (OPTIONAL)</Text>
                        <TextInput
                            style={s.input}
                            multiline
                            placeholder="Describe the issue..."
                            placeholderTextColor={colors.fog}
                            value={details}
                            onChangeText={setDetails}
                            keyboardAppearance="dark"
                            accessibilityLabel="Report details"
                            selectionColor={'rgba(218,165,32,0.3)'}
                        />

                        <PressableScale
                            style={[s.submitBtn, (!selectedReason || submitting) && s.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!selectedReason || submitting}
                            pressedScale={0.97}
                        >
                            <Text style={s.submitText}>{submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}</Text>
                        </PressableScale>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    triggerBtn: { padding: 4 },
    triggerText: { fontSize: 16, color: colors.fog },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    card: {
        backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderTopWidth: 2, borderTopColor: colors.sepia, padding: 24,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    closeText: { fontSize: 18, color: colors.fog },
    label: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    reasonBtn: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, marginBottom: 6 },
    reasonActive: { borderColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.1)' },
    reasonText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
    reasonTextActive: { color: colors.sepia },
    input: {
        backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.ash,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 10, minHeight: 80, borderRadius: 4,
        textAlignVertical: 'top',
    },
    submitBtn: { backgroundColor: colors.sepia, paddingVertical: 14, alignItems: 'center', borderRadius: 4, marginTop: 16 },
    submitBtnDisabled: { opacity: 0.4 },
    submitText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },
    labelWithGap: { marginTop: 16 },
});
