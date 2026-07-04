// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { RefObject } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, MessageSquare, Edit3, MessageCircle, ChevronDown } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/src/components/log/logDetailStyles';

const AnimatedView = Animated.createAnimatedComponent(View);

interface LogActionDeckProps {
  logId: string;
  log: {
    film_id: number;
    film_title: string;
    poster_path: string | null;
    is_autopsied?: boolean;
    autopsy?: {
      story?: number;
      screenplay?: number;
      script?: number;
      acting?: number;
      direction?: number;
      cinematography?: number;
      editing?: number;
      pacing?: number;
      sound?: number;
    } | null;
  };
  isOwner: boolean;
  endorsed: boolean;
  autopsyOpen: boolean;
  onToggleEndorse: () => void;
  onToggleAutopsy: () => void;
  onCritiquePress: () => void;
  onEditPress: () => void;
  onLoungePress: () => void;
}

export default function LogActionDeck({
  logId,
  log,
  isOwner,
  endorsed,
  autopsyOpen,
  onToggleEndorse,
  onToggleAutopsy,
  onCritiquePress,
  onEditPress,
  onLoungePress,
}: LogActionDeckProps) {
  return (
    <>
      {/* Autopsy Celluloid Gauge */}
      {log.is_autopsied && log.autopsy && (
        <View style={s.autopsyWrap}>
           <PressableScale 
              onPress={onToggleAutopsy} 
              style={s.autopsyToggle}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              pressedScale={0.98}
              haptic="selection"
            >
              <View style={s.autopsyToggleInner}>
                 <View style={s.autopsyPulse} />
                 <Text style={s.autopsyToggleTitle}>THE AUTOPSY</Text>
                 <Text style={s.autopsyToggleConf}>CONFIDENTIAL</Text>
               </View>
               <ChevronDown size={12} color={colors.fog} style={autopsyOpen ? s.rotated : undefined} />
           </PressableScale>

           {autopsyOpen && (
             <AnimatedView entering={FadeInDown.duration(400)}>
               <AutopsyGauge autopsy={log.autopsy} />
             </AnimatedView>
           )}
        </View>
      )}

      <View style={s.actionDeckWrap}>
        <View style={s.actionDeck}>
           {/* CERTIFY — wired to toggleEndorse */}
           <PressableScale style={s.deckBtn} onPress={onToggleEndorse} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
              <Heart size={16} strokeWidth={2} color={endorsed ? colors.crimson : colors.fog} fill={endorsed ? colors.crimson : 'transparent'} />
              <Text style={[s.deckLabel, endorsed && s.deckLabelCertified]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
           </PressableScale>

           {/* CRITIQUE — scrolls to comment input */}
           <PressableScale style={s.deckBtn} onPress={onCritiquePress} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection" pressedScale={0.92}>
              <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
              <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>CRITIQUE</Text>
           </PressableScale>

           {isOwner && (
             <PressableScale style={s.deckBtn} onPress={onEditPress} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
                <Edit3 size={16} strokeWidth={2} color={colors.sepia} />
                <Text style={[s.deckLabel, s.deckLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>EDIT</Text>
             </PressableScale>
           )}

           {/* LOUNGE — opens ShareToLoungeModal with this log's film */}
           <PressableScale style={s.deckBtn} onPress={onLoungePress} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium" pressedScale={0.92}>
              <MessageCircle size={16} strokeWidth={2} color={colors.fog} />
              <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>LOUNGE</Text>
           </PressableScale>
        </View>
      </View>
    </>
  );
}
