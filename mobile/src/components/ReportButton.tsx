/**
 * ReportButton — Content reporting with reason selection.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';

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
                target_id: targetId,
                target_type: targetType,
                reason: selectedReason,
                details: details.trim() || null,
            });
            Alert.alert('Report Submitted', 'Thank you. The Society moderators will review this.');
            setVisible(false);
            setSelectedReason(''); setDetails('');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to submit report.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.7} style={s.triggerBtn}>
                <Text style={s.triggerText}>⚑</Text>
            </TouchableOpacity>

            <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
                <View style={s.overlay}>
                    <View style={s.card}>
                        <View style={s.header}>
                            <Text style={s.title}>Report Content</Text>
                            <TouchableOpacity onPress={() => setVisible(false)}>
                                <Text style={s.closeText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={s.label}>SELECT REASON</Text>
                        {REPORT_REASONS.map(reason => (
                            <TouchableOpacity
                                key={reason}
                                style={[s.reasonBtn, selectedReason === reason && s.reasonActive]}
                                onPress={() => { setSelectedReason(reason); Haptics.selectionAsync(); }}
                            >
                                <Text style={[s.reasonText, selectedReason === reason && s.reasonTextActive]}>{reason}</Text>
                            </TouchableOpacity>
                        ))}

                        <Text style={[s.label, { marginTop: 16 }]}>ADDITIONAL DETAILS (OPTIONAL)</Text>
                        <TextInput
                            style={s.input}
                            multiline
                            placeholder="Describe the issue..."
                            placeholderTextColor={colors.fog}
                            value={details}
                            onChangeText={setDetails}
                        />

                        <TouchableOpacity
                            style={[s.submitBtn, (!selectedReason || submitting) && { opacity: 0.4 }]}
                            onPress={handleSubmit}
                            disabled={!selectedReason || submitting}
                        >
                            <Text style={s.submitText}>{submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}</Text>
                        </TouchableOpacity>
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
    submitText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
