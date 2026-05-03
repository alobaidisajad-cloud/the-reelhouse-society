import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Heart, Sparkles, ChevronRight } from 'lucide-react-native';

import { colors, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { Dossier } from '@/src/stores/content';
import { WireStory } from './types';
import { st } from './styles';

export const DossierCard = memo(function DossierCard({ dossier, index, onPress }: { dossier: Dossier; index: number; onPress: (d: Dossier) => void }) {
  const isFeature = index === 0;

  return (
    <PressableScale style={[st.dossierCard, isFeature && st.dossierCardFeature]} onPress={() => onPress(dossier)} pressedScale={isFeature ? 0.98 : 0.96} haptic accessibilityRole="button" accessibilityLabel={`Dossier: ${dossier.title} by ${dossier.author}`}>
      <View style={st.dossierAccentBar} />

      <View style={st.dossierMeta}>
        <View style={st.dmAuthorRow}>
          <Sparkles size={isFeature ? 10 : 8} color={colors.sepia} strokeWidth={2} />
          <Text style={[st.dmAuthor, isFeature && { fontSize: 10, opacity: 1 }]} numberOfLines={1}>BY {dossier.author}</Text>
        </View>
        <Text style={st.dmDate} numberOfLines={1}>FILED {dossier.date}</Text>
      </View>

      <Text style={[st.dossierTitle, isFeature && st.dossierTitleFeature]} numberOfLines={isFeature ? 3 : 2}>{dossier.title}</Text>

      {dossier.excerpt && isFeature ? (
        <View style={st.dossierExcerptRow}>
          <Text style={st.dossierDropCap}>{dossier.excerpt.charAt(0)}</Text>
          <Text style={st.dossierExcerpt} numberOfLines={4}>{dossier.excerpt.slice(1)}</Text>
        </View>
      ) : null}

      <View style={st.dossierFooter}>
        <View style={st.dossierStatsRow}>
          <View style={st.dossierStatItem}>
            <Eye size={10} color={colors.fog} strokeWidth={1.5} />
            <Text style={st.dossierStatText}>{dossier.views || 0}</Text>
          </View>
          <View style={st.dossierStatItem}>
            <Heart size={10} color={dossier.certifyCount ? colors.sepia : colors.fog} strokeWidth={1.5} fill={dossier.certifyCount ? colors.sepia : 'transparent'} />
            <Text style={[st.dossierStatText, !!dossier.certifyCount && st.dossierStatTextActive]}>{dossier.certifyCount || 0}</Text>
          </View>
        </View>
        
        <View style={st.dossierReadMore}>
          <Text style={st.dossierReadMoreText} numberOfLines={1}>{isFeature ? '[ INITIATE FULL VIEW ]' : '[ INITIATE VIEW ]'}</Text>
          <ChevronRight size={12} color={colors.sepia} strokeWidth={2} />
        </View>
      </View>
    </PressableScale>
  );
});

export const WireItem = memo(function WireItem({ item, isLead, onPress }: { item: WireStory; isLead?: boolean; onPress: (item: WireStory) => void }) {
  if (isLead) {
    return (
      <PressableScale style={st.wireLead} onPress={() => onPress(item)} pressedScale={0.98} haptic accessibilityRole="button" accessibilityLabel={`Wire article: ${item.title}`}>
        {item.image && (
          <View style={st.wireLeadImgWrap}>
            <Image source={{ uri: item.image }} style={st.wireLeadImg} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={150} />
            <LinearGradient
              colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}
        <View style={st.wireLeadBody}>
          <Text style={st.wireCategory} numberOfLines={1}>[{item.category ?? 'WIRE'}]</Text>
          <Text style={st.wireLeadTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={st.wireLeadExcerpt} numberOfLines={3}>{item.excerpt}</Text>
          <Text style={st.wireMeta} numberOfLines={1}>
            {item.date} · {item.time} · BY {(item.author ?? 'THE ORACLE').toUpperCase()}
          </Text>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale style={st.wireItem} onPress={() => onPress(item)} pressedScale={0.98} haptic accessibilityRole="button" accessibilityLabel={`Wire article: ${item.title}`}>
      <View style={st.wireItemInner}>
        <Text style={st.wireCategory} numberOfLines={1}>[{item.category ?? 'WIRE'}]</Text>
        <Text style={st.wireTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={st.wireExcerpt} numberOfLines={2}>{item.excerpt}</Text>
        <Text style={st.wireMeta} numberOfLines={1}>
          {item.date} · {item.time} · BY {(item.author ?? 'THE ORACLE').toUpperCase()}
        </Text>
      </View>
    </PressableScale>
  );
});
