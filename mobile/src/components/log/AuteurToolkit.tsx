import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import TactileEngine from '@/src/utils/TactileEngine';
import { Lock } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import { AUTOPSY_INIT } from '@/src/hooks/useLogFlow';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';

const AUTOPSY_LABELS: Record<string, string> = {
    story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR',
    cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN',
};

interface Props {
    isAuteur: boolean;
    autopsyOpen: boolean;
    setAutopsyOpen: (v: boolean) => void;
    autopsy: Record<string, number | null>;
    setAutopsy: (v: Record<string, number | null>) => void;
    availablePosters: { file_path: string }[];
    altPoster: string | null;
    setAltPoster: (v: string | null) => void;
    onUpgradePress: () => void;
}

const posterKeyExtractor = (p: { file_path: string }) => p.file_path;

export default React.memo(function AuteurToolkit({
    isAuteur, autopsyOpen, setAutopsyOpen,
    autopsy, setAutopsy, availablePosters, altPoster, setAltPoster, onUpgradePress
}: Props) {
    const renderPosterItem = React.useCallback(({ item: p }: { item: { file_path: string } }) => p.file_path === '__default__' ? (
        <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} onPress={() => { setAltPoster(null); }} style={[st.pThumb, altPoster === null && st.pThumbActive]} haptic="selection" pressedScale={0.96}>
            <Text style={[st.pDefault, altPoster === null && st.pDefaultActive]}>DEFAULT</Text>
        </PressableScale>
    ) : (
        <PressableScale onPress={() => { setAltPoster(p.file_path); }} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Select this alternate poster">
            <Image source={{ uri: tmdb.poster(p.file_path, 'w92') }} style={[st.pImg, altPoster === p.file_path && st.pImgActive, altPoster && altPoster !== p.file_path && st.pImgFaded]} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        </PressableScale>
    ), [altPoster, setAltPoster]);

    return (
        <View style={[st.auteurBox, !isAuteur && st.auteurLocked]} pointerEvents={isAuteur ? 'auto' : 'box-none'}>
            {/* Pure UI toggle — opening or closing this section NEVER touches the
                data. Only tapped scores exist; the payload derives "autopsied"
                from rated axes alone (see buildLogPayload). */}
            <PressableScale style={st.auteurHead} onPress={() => { if (!isAuteur) { onUpgradePress(); return; } setAutopsyOpen(!autopsyOpen); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" pressedScale={0.96}>
                <Text style={st.auteurHeadText}>{autopsyOpen ? '[-] HIDE DEEP AUTOPSY' : '[+] PERFORM DEEP AUTOPSY'}</Text>
                {!isAuteur && <View style={st.upgradeLockRow}><Lock size={10} color={colors.bloodReel} /><Text style={st.upgradeLink}>UPGRADE</Text></View>}
            </PressableScale>

            {autopsyOpen && isAuteur && (
                <Animated.View entering={FadeInDown.duration(200)} style={st.autopContent}>
                    <View>
                        <Text style={st.editLabel}>THE AUTOPSY ENGINE (0-10)</Text>
                        <Text style={st.editHint} {...scaledTextProps}>TAP A NOTCH TO FILE A SCORE — A DELIBERATE 0 COUNTS. TAP IT AGAIN TO WITHDRAW.</Text>
                        {Object.keys(AUTOPSY_INIT).map(axis => {
                            const rated = typeof autopsy[axis] === 'number';
                            const val = autopsy[axis];
                            return (
                                <View key={axis} style={st.sliderRow}>
                                    <Text style={st.sliderLabel}>{AUTOPSY_LABELS[axis] || axis.toUpperCase()}</Text>
                                    <View style={st.sliderTrack}>
                                        {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                                            <PressableScale
                                                key={v}
                                                onPress={() => { setAutopsy({ ...autopsy, [axis]: val === v ? null : v }); }}
                                                style={[st.sliderSeg, rated && v <= (val as number) && st.sliderSegOn]}
                                                hitSlop={{ top: 10, bottom: 10, left: 1, right: 1 }} haptic="light" pressedScale={0.9}
                                                accessibilityLabel={`${AUTOPSY_LABELS[axis] || axis} score ${v}${val === v ? ' — tap to withdraw' : ''}`}
                                            />
                                        ))}
                                    </View>
                                    <Text style={[st.sliderVal, !rated && st.sliderValUnrated]}>{rated ? String(val) : '—'}</Text>
                                </View>
                            );
                        })}
                    </View>
                    
                    {/* Live preview of exactly what readers will see — the _v marker
                        tells the gauge these zeros are deliberate verdicts. */}
                    <AutopsyGauge autopsy={{ _v: 2, ...autopsy }} />
                    
                    <View>
                        <Text style={st.editLabel}>CURATORIAL CONTROL (ALT POSTER)</Text>
                        {/* A plain scroller, not a FlashList. A horizontal virtualised
                            list nested inside a vertical ScrollView has no bounded
                            height to measure against and commonly renders NOTHING —
                            which is exactly the symptom reported for this feature. For
                            a fixed set of ~20 thumbnails virtualisation buys nothing
                            anyway; this is both cheaper and certain to appear. */}
                        {availablePosters.length > 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGapPad} keyboardShouldPersistTaps="handled">
                                {[{ file_path: '__default__' }, ...availablePosters].map(p => (
                                    <React.Fragment key={posterKeyExtractor(p)}>{renderPosterItem({ item: p })}</React.Fragment>
                                ))}
                            </ScrollView>
                        ) : <Text style={st.noData}>No alternative posters found on TMDB.</Text>}
                    </View>
                </Animated.View>
            )}
        </View>
    );
});

const st = StyleSheet.create({
    auteurBox: { padding: 16, borderWidth: 1, borderColor: colors.bloodReel, borderRadius: 6, backgroundColor: 'rgba(107,26,10,0.05)', marginBottom: 20 },
    auteurLocked: { opacity: 0.5 },
    auteurHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    auteurHeadText: { fontFamily: fonts.display, fontSize: 12, color: colors.bloodReel },
    upgradeLockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    upgradeLink: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.bloodReel, textDecorationLine: 'underline' },
    autopContent: { gap: 20, marginTop: 16 },
    editLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.bone, marginBottom: 8, includeFontPadding: false },
    editHint: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1, color: colors.fog, opacity: 0.8, marginBottom: 10, lineHeight: 11, includeFontPadding: false },
    sliderValUnrated: { color: colors.fog, opacity: 0.6 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sliderLabel: { width: 90, fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 0.5, color: colors.fog, includeFontPadding: false },
    sliderTrack: { flex: 1, flexDirection: 'row', gap: 2, height: 20 },
    sliderSeg: { flex: 1, backgroundColor: colors.ash, borderRadius: 1, height: 20 },
    sliderSegOn: { backgroundColor: colors.bloodReel },
    sliderVal: { width: 20, textAlign: 'right', fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    pThumb: { width: 44, height: 66, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    pThumbActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    pDefault: { fontFamily: fonts.sub, fontSize: 6.5, color: colors.fog, includeFontPadding: false },
    pImg: { width: 44, height: 66, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    pImgActive: { borderWidth: 2, borderColor: colors.bloodReel },
    pImgFaded: { opacity: 0.4 },
    pDefaultActive: { color: colors.ink },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },
    flatListGapPad: { gap: 8, paddingRight: 20 },
});
