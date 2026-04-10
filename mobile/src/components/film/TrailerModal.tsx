import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';

export function TrailerModal({ visible, videoId, onClose }: { visible: boolean; videoId: string; onClose: () => void }) {
    if (!visible || !videoId) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                {/* Close button — matches web: "X CLOSE" text button above video */}
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                    <X size={12} color={colors.parchment} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </TouchableOpacity>
                <View style={s.videoWrap}>
                    <WebView
                        source={{ uri: `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0` }}
                        style={s.webview}
                        allowsInlineMediaPlayback
                        mediaPlaybackRequiresUserAction={false}
                        startInLoadingState
                        renderLoading={() => <ActivityIndicator size="large" color={colors.sepia} style={StyleSheet.absoluteFillObject} />}
                    />
                </View>
                {/* OFFICIAL TRAILER label — matches web */}
                <Text style={s.trailerLabel}>OFFICIAL TRAILER</Text>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(8, 6, 4, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    closeBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        padding: 8,
        paddingHorizontal: 12,
        zIndex: 10,
        backgroundColor: 'transparent',
        borderRadius: 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    closeBtnText: {
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 1.5,
        color: colors.parchment,
    },
    videoWrap: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: colors.ink,
        borderRadius: 2,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 40 },
        shadowOpacity: 0.8,
        shadowRadius: 40,
        elevation: 30,
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    trailerLabel: {
        fontFamily: fonts.ui,
        fontSize: 8,
        letterSpacing: 3,
        color: colors.fog,
        marginTop: 12,
        textAlign: 'center',
    },
});
