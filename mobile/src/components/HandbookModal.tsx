/**
 * HandbookModal — User handbook / guide.
 */
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

const SECTIONS = [
    { title: 'THE RATING SCALE', body: '1 Reel — Abysmal\n2 Reels — Below Average\n3 Reels — Decent\n4 Reels — Excellent\n5 Reels — Masterpiece' },
    { title: 'MEMBERSHIP TIERS', body: 'Patron — Free tier, basic logging\nArchivist — Full access, CSV export, priority\nAuteur — Ultimate tier with Projector Room & Programmes' },
    { title: 'PASSPORT STAMPS', body: 'Earn stamps by reaching milestones: 100 logs, pre-1960 classics, perfect ratings, physical media, and more.' },
    { title: 'THE LOUNGE', body: 'Real-time chat rooms for Society members. Discuss films, share recommendations, and debate the canon.' },
    { title: 'CINEMA DNA', body: 'Your unique cinematic fingerprint. Computed from your genre preferences, decade distribution, and viewing patterns.' },
];

export default function HandbookModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.card}>
                    <View style={s.header}>
                        <Text style={s.title}>The Society Handbook</Text>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                            <Text style={s.closeText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
                        {SECTIONS.map((section, i) => (
                            <Animated.View key={section.title} entering={FadeIn.delay(i * 100).duration(300)} style={s.section}>
                                <Text style={s.sectionTitle}>{section.title}</Text>
                                <Text style={s.sectionBody}>{section.body}</Text>
                            </Animated.View>
                        ))}
                        <View style={s.footerPad} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    card: {
        backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderTopWidth: 2, borderTopColor: colors.sepia, maxHeight: '80%',
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    title: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment },
    closeText: { fontFamily: fonts.ui, fontSize: 20, color: colors.fog },
    scrollContent: { paddingHorizontal: 20 },
    section: { marginBottom: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
    sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    sectionBody: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, lineHeight: 22 },
    footerPad: { height: 40 },
});
