import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import React, { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import { useOverlayTop } from '@/src/components/layout/navMetrics';
import { WebView } from 'react-native-webview';
import { ToastHost } from '@/src/components/ToastHost';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { youtubeKey } from '@/src/utils/outsideValues';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** YouTube's privacy-enhanced origin: the player's page and its embed, and nothing else at the top. */
export const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';

// YouTube throws "Error 153 / video player configuration error" when its /embed
// URL is loaded as the top document (no valid referrer/origin). The fix is to
// serve a tiny HTML page — with a real baseUrl below — that hosts the embed in an
// <iframe>, which gives YouTube the origin its embed validation requires. The key is
// written into the page, so only a key of YouTube's own shape (youtubeKey) is ever given.
// The picture waits for the member's tap to play. The page listens to the player as YouTube's
// iframe API speaks (enablejsapi): it says it is listening, and passes on the player's ready
// and its refusal (heardFromPlayer).
const buildEmbedHtml = (key: string) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
  <iframe id="player"
    src="${PLAYER_ORIGIN}/embed/${key}?enablejsapi=1&origin=${PLAYER_ORIGIN}&modestbranding=1&rel=0&controls=1&playsinline=1&iv_load_policy=3&fs=1&color=white"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowfullscreen>
  </iframe>
<script>
  var player = document.getElementById('player');
  window.addEventListener('message', function (e) {
    if (e.origin !== '${PLAYER_ORIGIN}' || !window.ReactNativeWebView) return;
    var said; try { said = JSON.parse(e.data); } catch (_) { return; }
    if (said && (said.event === 'onReady' || said.event === 'onError')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ event: said.event, info: said.info }));
    }
  });
  player.addEventListener('load', function () {
    player.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '${PLAYER_ORIGIN}');
  });
</script>
</body>
</html>`;

// Stops playback immediately by navigating the embed frame away — the parent
// document may re-point its own iframe even cross-origin.
const STOP_PLAYBACK_JS = `
  (function(){ try {
    var f = document.querySelectorAll('iframe');
    for (var i=0;i<f.length;i++){ f[i].src = 'about:blank'; }
  } catch(e){} })();
  true;
`;

/**
 * What the player's page may load. The page itself stays on the player's origin (or blank,
 * when it is stopped). iOS asks for every frame inside it too (isTopFrame false; Android asks
 * for the page alone): YouTube's own frames load over https, and the page never leaves.
 */
export function playerMayLoad({ url, isTopFrame }: { url: string; isTopFrame?: boolean }): boolean {
  if (url === 'about:blank' || url === PLAYER_ORIGIN || url.startsWith(`${PLAYER_ORIGIN}/`)) return true;
  return isTopFrame === false && url.startsWith('https://');
}

/**
 * What the player said, as the page passes it on: ready, or a refusal by YouTube's error code
 * (153: the page's origin refused; 100: no such video; 101 and 150: not to be played here).
 * Anything else the page is sent is nothing.
 */
export function heardFromPlayer(data: string): { said: 'ready' } | { said: 'refused'; code: number | null } | null {
  let m: { event?: unknown; info?: unknown };
  try { m = JSON.parse(data); } catch { return null; }
  if (m?.event === 'onReady') return { said: 'ready' };
  if (m?.event === 'onError') return { said: 'refused', code: typeof m.info === 'number' ? m.info : null };
  return null;
}

/** A video as TMDB lists it: the player names it by what it is. */
export interface Footage { key: string; name?: string; type?: string }

/**
 * What the player prints under the picture: the video's own name ("Official
 * Trailer 2"), or its kind. Never "OFFICIAL TRAILER" over a featurette, a clip
 * or a teaser, which the footage rail plays here too.
 */
export function footageLabel(video: Footage): string {
  return video.name?.trim() || (video.type ? video.type.toUpperCase() : 'FOOTAGE');
}

export const TrailerModal = memo(function TrailerModal({ visible, videoId, label, onClose }: {
    visible: boolean; videoId: string; label: string; onClose: () => void;
}) {
    // A React Native <Modal>: the whole screen, never a sheet.
    const closeTop = useOverlayTop(false);
    const [shouldRender, setShouldRender] = useState(visible);
    const webviewRef = useRef<WebView>(null);
    const key = youtubeKey(videoId);
    // What the player said of this play: the sealed run waits for 'ready' (trailer.yaml).
    const [said, setSaid] = useState<'ready' | 'refused' | null>(null);

    useEffect(() => {
        const wv = webviewRef.current;
        let timer: ReturnType<typeof setTimeout>;
        if (visible) {
            setShouldRender(true);
            setSaid(null);
        } else {
            wv?.injectJavaScript(STOP_PLAYBACK_JS);
            timer = setTimeout(() => setShouldRender(false), 300);
        }
        return () => {
            if (timer) clearTimeout(timer);
            wv?.injectJavaScript(STOP_PLAYBACK_JS);
        };
    }, [visible]);

    if (!shouldRender || !key) return null;

    return (
        <Modal statusBarTranslucent visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay} accessibilityViewIsModal={true} onAccessibilityEscape={onClose}>
                {/* Close button — matches web: "X CLOSE" text button above video */}
                <PressableScale testID="trailer-close" touch="wayOut" style={[s.closeBtn, { top: closeTop }]} onPress={onClose} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.96}
                    accessibilityRole="button" accessibilityLabel="Close">
                    <X size={12} color={colors.parchment} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </PressableScale>
                <View style={s.videoWrap}>
                    {/* Nitrate Projector Overlay: Tints the raw YouTube feed sepia */}
                    <View style={{ position: 'absolute', zIndex: 2, top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        <LinearGradient
                            colors={['rgba(184,137,26,0.25)', 'transparent', 'rgba(184,137,26,0.15)']}
                            style={[StyleSheet.absoluteFill, WASH]}
                        />
                    </View>
                    <WebView
                        ref={webviewRef}
                        source={{ html: buildEmbedHtml(key), baseUrl: PLAYER_ORIGIN }}
                        style={s.webview}
                        // Every load is judged by playerMayLoad. The library's own allow-list is
                        // left open: an address it refuses, it OPENS in the phone, and iOS asks it
                        // for every frame inside YouTube's player.
                        originWhitelist={['*']}
                        onShouldStartLoadWithRequest={playerMayLoad}
                        onMessage={(e) => {
                            const heard = heardFromPlayer(e.nativeEvent.data);
                            if (!heard) return;
                            setSaid(heard.said);
                            e2eTrace(`trailer.${heard.said}`, heard.said === 'refused' ? { code: heard.code } : undefined);
                        }}
                        // Nothing YouTube writes (cookies, storage, cache) outlives one play.
                        incognito
                        thirdPartyCookiesEnabled={false}
                        sharedCookiesEnabled={false}
                        allowsInlineMediaPlayback
                        mediaPlaybackRequiresUserAction={false}
                        javaScriptEnabled
                        domStorageEnabled
                        allowsBackForwardNavigationGestures={false}
                        bounces={false}
                        scrollEnabled={false}
                        startInLoadingState
                        renderLoading={() => <ActivityIndicator size="large" color={colors.sepia} style={StyleSheet.absoluteFill} />}
                    />
                    {said && <View testID={`trailer-${said}`} collapsable={false} pointerEvents="none" style={s.said} />}
                </View>
                <Text style={s.trailerLabel} numberOfLines={2}>{label}</Text>
                <ToastHost />
            </View>
        </Modal>
    );
})

const s = StyleSheet.create({
    overlay: { ...EDGE_LIT,
        flex: 1,
        backgroundColor: colors.soot,
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
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    // A point, undrawn: what the player said, for the sealed run to read.
    said: { position: 'absolute', left: 0, bottom: 0, width: 1, height: 1 },
    trailerLabel: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 1.9,
        color: colors.fog,
        marginTop: 12,
        textAlign: 'center',
        includeFontPadding: false,
    },
});
