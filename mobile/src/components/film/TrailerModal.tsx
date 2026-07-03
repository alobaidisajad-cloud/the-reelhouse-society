import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import React, { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

export const TrailerModal = memo(function TrailerModal({ visible, videoId, onClose }: { visible: boolean; videoId: string; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    const [shouldRender, setShouldRender] = useState(visible);
    const webviewRef = useRef<WebView>(null);

    useEffect(() => {
        const wv = webviewRef.current;
        let timer: ReturnType<typeof setTimeout>;
        
        if (visible) {
            setShouldRender(true);
        } else {
            wv?.injectJavaScript(`
                var v = document.querySelectorAll('video');
                for(var i=0; i<v.length; i++) { v[i].pause(); }
                window.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                true;
            `);
            timer = setTimeout(() => setShouldRender(false), 300);
        }

        return () => {
            if (timer) clearTimeout(timer);
            wv?.injectJavaScript(`
                var v = document.querySelectorAll('video');
                for(var i=0; i<v.length; i++) { v[i].pause(); }
                window.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                true;
            `);
        };
    }, [visible]);

    if (!shouldRender || !videoId) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay} accessibilityViewIsModal={true}>
                {/* Close button — matches web: "X CLOSE" text button above video */}
                <PressableScale style={[s.closeBtn, { top: Math.max(insets.top + 10, 50) }]} onPress={onClose} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.96}>
                    <X size={12} color={colors.parchment} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </PressableScale>
                <View style={s.videoWrap}>
                    {/* Nitrate Projector Overlay: Tints the raw YouTube feed sepia */}
                    <View style={{ position: 'absolute', zIndex: 2, top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        <LinearGradient 
                            colors={['rgba(184,137,26,0.25)', 'transparent', 'rgba(184,137,26,0.15)']} 
                            style={StyleSheet.absoluteFillObject} 
                        />
                    </View>
                    <WebView
                        ref={webviewRef}
                        source={{ uri: `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&controls=1&showinfo=0&fs=1&playsinline=1&iv_load_policy=3&enablejsapi=1` }}
                        style={s.webview}
                        originWhitelist={['https://www.youtube.com', 'https://www.google.com']}
                        onShouldStartLoadWithRequest={(request) => {
                            // Security: Only allow YouTube embed and Google OAuth domains
                            return request.url.startsWith('https://www.youtube.com/') ||
                                   request.url.startsWith('https://www.google.com/');
                        }}
                        allowsInlineMediaPlayback
                        mediaPlaybackRequiresUserAction={false}
                        allowsBackForwardNavigationGestures={false}
                        bounces={false}
                        scrollEnabled={false}
                        startInLoadingState
                        renderLoading={() => <ActivityIndicator size="large" color={colors.sepia} style={StyleSheet.absoluteFillObject} />}
                    />
                </View>
                {/* OFFICIAL TRAILER label — matches web */}
                <Text style={s.trailerLabel}>OFFICIAL TRAILER</Text>
            </View>
        </Modal>
    );
})

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
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 1.5,
        color: colors.parchment,
        includeFontPadding: false,
    },
    videoWrap: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: colors.ink,
        borderRadius: 2,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.3)',
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
        fontFamily: fonts.sub,
        fontSize: 8,
        letterSpacing: 3,
        color: colors.fog,
        marginTop: 12,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
