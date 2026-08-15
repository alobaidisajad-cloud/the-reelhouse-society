/**
 * PersonBio — Collapsible classified dossier biography section.
 */
import { memo } from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/src/components/person/personStyles';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';

interface PersonBioProps {
  biography: string;
  isLongBio: boolean;
  showFullBio: boolean;
  handleToggleBio: () => void;
}

export const PersonBio = memo(function PersonBio({
  biography,
  isLongBio,
  showFullBio,
  handleToggleBio,
}: PersonBioProps) {
  return (
    <View style={s.bioSection}>
      <LinearGradient
        colors={['rgba(184,137,26,0.4)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.bioTopLine}
      />
      <Text style={s.bioLabel} {...displayTextProps}>CLASSIFIED DOSSIER — BIOGRAPHY</Text>
      <View style={s.bioTextWrap}>
        <Text style={s.bioText} {...scaledTextProps} numberOfLines={!isLongBio || showFullBio ? undefined : 6}>{biography}</Text>
        {isLongBio && !showFullBio && (
          <LinearGradient
            colors={['transparent', 'rgba(19,15,10,0.8)', 'rgba(19,15,10,1)']}
            style={s.bioFadeMask}
            pointerEvents="none"
          />
        )}
      </View>
      {isLongBio && (
        <PressableScale 
          style={s.toggleTicketBtn} 
          onPress={handleToggleBio}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          haptic="light"
        >
          <Text style={s.toggleTicketText} {...displayTextProps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{showFullBio ? '[ READ LESS ]' : '[ READ MORE ]'}</Text>
        </PressableScale>
      )}
    </View>
  );
});
