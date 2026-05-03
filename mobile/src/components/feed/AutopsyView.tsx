import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

const AnimatedView = Animated.createAnimatedComponent(View);

interface AutopsyViewProps {
  isAutopsied?: boolean;
  autopsy?: Record<string, number>;
}

export const AutopsyView = React.memo(function AutopsyView({ isAutopsied, autopsy }: AutopsyViewProps) {
  const [autopsyOpen, setAutopsyOpen] = useState(false);

  if (!isAutopsied && !autopsy) return null;

  return (
    <View style={s.autopsySectionWrap}>
       <PressableScale 
          onPress={() => { setAutopsyOpen(!autopsyOpen); }} 
          style={s.autopsyToggleBtn}
          haptic="selection"
          pressedScale={0.97}
        >
          <View style={s.autopsyToggleContent}>
            <AnimatedView style={s.autopsyDot} />
            <Text style={s.autopsyTitle}>THE AUTOPSY</Text>
            <Text style={s.autopsyConfidential}>CONFIDENTIAL</Text>
          </View>
          <Text style={[s.autopsyChevron, autopsyOpen && s.autopsyChevronOpen]}>▼</Text>
       </PressableScale>

       {autopsyOpen && (
         <AnimatedView entering={FadeInUp.duration(300)} style={s.autopsyCard}>
           <View style={s.autopsyInner}>
             {[
                { key: 'story', label: 'STORY', value: autopsy?.story !== undefined ? autopsy.story : autopsy?.screenplay ?? 0 },
                { key: 'script', label: 'SCRIPT / DIALOGUE', value: autopsy?.script !== undefined ? autopsy.script : autopsy?.screenplay ?? 0 },
                { key: 'acting', label: 'ACTING & CHARACTER', value: autopsy?.acting ?? autopsy?.direction ?? 0 },
                { key: 'cinematography', label: 'CINEMATOGRAPHY', value: autopsy?.cinematography ?? 0 },
                { key: 'editing', label: 'EDITING & PACING', value: autopsy?.editing !== undefined ? autopsy.editing : autopsy?.pacing ?? 0 },
                { key: 'sound', label: 'SOUND DESIGN & SCORE', value: autopsy?.sound ?? 0 },
             ].map(stat => (
               <View key={stat.key} style={{ marginBottom: 12 }}>
                 <View style={s.autopsyBarHeader}>
                   <Text style={s.autopsyLabel}>{stat.label}</Text>
                   <Text style={s.autopsyValue}>{stat.value === 10 ? '10.0' : parseFloat(String(stat.value)).toFixed(1)}</Text>
                 </View>
                 <PressableScale haptic="medium" style={s.autopsyTrack} pressedScale={0.99}>
                   <View style={s.sprocketStrip}>
                     {Array.from({ length: 30 }).map((_, i) => (
                       <View key={i} style={s.sprocketHole} />
                     ))}
                   </View>
                   <LinearGradient colors={[colors.sepia, '#5a430d']} style={[s.autopsyFill, { width: `${(stat.value / 10) * 100}%` }]} start={{x:0, y:0}} end={{x:0, y:1}}>
                     <View style={s.cutMarker} />
                   </LinearGradient>
                 </PressableScale>
               </View>
             ))}
           </View>
         </AnimatedView>
       )}
    </View>
  );
});

const s = StyleSheet.create({
  autopsySectionWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,105,20,0.15)',
    backgroundColor: 'rgba(20,15,5,0.4)',
  },
  autopsyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  autopsyToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autopsyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  autopsyTitle: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.bone,
  },
  autopsyConfidential: {
    fontFamily: fonts.ui,
    fontSize: 6,
    letterSpacing: 2,
    color: colors.bone,
    backgroundColor: 'rgba(180,45,45,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.5)',
    transform: [{ rotate: '-2deg' }],
  },
  autopsyChevron: {
    color: colors.fog,
    fontSize: 10,
    transform: [{ rotate: '0deg' }],
  },
  autopsyChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  autopsyCard: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  autopsyInner: {
    backgroundColor: 'rgba(5,2,2,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(180,45,45,0.35)',
    borderRadius: 4,
    padding: 16,
    elevation: 3,
    shadowColor: colors.bloodReel,
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  autopsyBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  autopsyLabel: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
  },
  autopsyValue: {
    fontFamily: fonts.display,
    fontSize: 12,
    color: colors.parchment,
  },
  autopsyTrack: {
    height: 12,
    backgroundColor: 'rgba(2,1,1,1)',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2, // Inner shadow simulation
  },
  sprocketStrip: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    opacity: 0.15,
    zIndex: 1,
  },
  sprocketHole: {
    width: 2,
    height: 4,
    backgroundColor: '#000',
    borderRadius: 1,
  },
  autopsyFill: {
    height: '100%',
    position: 'relative',
  },
  cutMarker: {
    position: 'absolute',
    right: 0,
    top: -2,
    bottom: -2,
    width: 3,
    backgroundColor: colors.bone,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    borderRadius: 2,
  },
});
