// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { RefObject } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, MessageSquare, Edit3, MessageCircle, ChevronDown, Bookmark } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import { hasRatedAutopsy } from '@/src/components/feed/AutopsyView';
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
  /** Whether this film is already in the member's watchlist. */
  filmSaved: boolean;
  autopsyOpen: boolean;
  onToggleEndorse: () => void;
  onToggleAutopsy: () => void;
  onCritiquePress: () => void;
  onSavePress: () => void;
  onEditPress: () => void;
  onLoungePress: () => void;
}

export default function LogActionDeck({
  logId,
  log,
  isOwner,
  endorsed,
  filmSaved,
  autopsyOpen,
  onToggleEndorse,
  onToggleAutopsy,
  onCritiquePress,
  onSavePress,
  onEditPress,
  onLoungePress,
}: LogActionDeckProps) {
  return (
    <>
      {/* Autopsy Celluloid Gauge — only when scores were genuinely filed */}
      {log.is_autopsied && hasRatedAutopsy(log.autopsy as Record<string, number> | null) && (
        <View style={s.autopsyWrap}>
           <PressableScale 
              onPress={onToggleAutopsy} 
              style={s.autopsyToggle}
              hitSlop={{ top: 4, bottom: 4, left: 15, right: 15 }}
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
               <AutopsyGauge autopsy={(log.autopsy ?? null) as Record<string, number | null> | null} />
             </AnimatedView>
           )}
        </View>
      )}

      <View style={s.actionDeckWrap}>
        <View style={s.actionDeck}>
           {/* CERTIFY — wired to toggleEndorse */}
           <PressableScale style={s.deckBtn} onPress={onToggleEndorse} hitSlop={{ top: 4, bottom: 8, left: 0, right: 0 }} haptic="light" pressedScale={0.92}>
              <Heart size={16} strokeWidth={2} color={endorsed ? colors.crimson : colors.fog} fill={endorsed ? colors.crimson : 'transparent'} />
              <Text style={[s.deckLabel, endorsed && s.deckLabelCertified]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
           </PressableScale>

           {/* CRITIQUE — scrolls to comment input */}
           <PressableScale style={s.deckBtn} onPress={onCritiquePress} hitSlop={{ top: 4, bottom: 8, left: 0, right: 0 }} haptic="selection" pressedScale={0.92}>
              <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
              <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>CRITIQUE</Text>
           </PressableScale>

           {/* The third slot adapts, exactly as the feed card's does: your own
               record offers EDIT, someone else's offers SAVE. This slot used to
               be owner-only, so a visitor got three buttons and no way to keep
               the film — the fuller surface offering less than the card. */}
           {isOwner ? (
             <PressableScale style={s.deckBtn} onPress={onEditPress} hitSlop={{ top: 4, bottom: 8, left: 0, right: 0 }} haptic="light" pressedScale={0.92}>
                <Edit3 size={16} strokeWidth={2} color={colors.sepia} />
                <Text style={[s.deckLabel, s.deckLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>EDIT</Text>
             </PressableScale>
           ) : (
             <PressableScale
               style={s.deckBtn}
               onPress={onSavePress}
               hitSlop={{ top: 4, bottom: 8, left: 0, right: 0 }}
               haptic="light"
               pressedScale={0.92}
               accessibilityState={{ selected: filmSaved }}
               accessibilityLabel={filmSaved ? 'Remove film from your watchlist' : 'Save film to your watchlist'}
             >
                <Bookmark size={16} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'} />
                <Text style={[s.deckLabel, filmSaved && s.deckLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{filmSaved ? 'SAVED' : 'SAVE'}</Text>
             </PressableScale>
           )}

           {/* LOUNGE — opens ShareToLoungeModal with this log's film */}
           <PressableScale style={s.deckBtn} onPress={onLoungePress} hitSlop={{ top: 4, bottom: 8, left: 0, right: 0 }} haptic="medium" pressedScale={0.92}>
              <MessageCircle size={16} strokeWidth={2} color={colors.fog} />
              <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>LOUNGE</Text>
           </PressableScale>
        </View>
      </View>
    </>
  );
}
