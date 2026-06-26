import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, SharedValue, useAnimatedRef, measure, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ActionDeck } from './ActionDeck';
import { AutopsyView } from './AutopsyView';
import { ReviewContent } from './ReviewContent';
import { UserAttributionRow } from './UserAttributionRow';
import { PosterFrame } from './PosterFrame';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';

// Single source of truth: Zod schema
import type { FeedItem } from '@/src/schemas/feed.schema';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const AnimatedView = Animated.createAnimatedComponent(View);
export type { FeedItem };

const ActivityCardShell = ({ children, isPremium, isAuteur }: { children: React.ReactNode, isPremium: boolean, isAuteur: boolean }) => {
  return (
    <>
      <LinearGradient 
        colors={isAuteur ? ['rgba(40,18,18,0.7)', 'rgba(14,5,5,0.95)'] : ['rgba(15, 12, 10, 0.95)', 'rgba(5, 4, 3, 0.98)']} 
        locations={[0, 1]} 
        style={StyleSheet.absoluteFillObject} 
      />
      {(isPremium || isAuteur) && (
        <>
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.08)' : 'rgba(139,105,20,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          <LinearGradient colors={[isAuteur ? 'rgba(125,31,31,0.04)' : 'rgba(139,105,20,0.04)', 'transparent']} start={{x: 1, y: 1}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
        </>
      )}
      {children}
    </>
  );
};

interface EditorialHeaderProps {
  item: Pick<FeedItem, 'editorial_header' | 'poster_path'>;
  isPremium: boolean;
  isAuteur: boolean;
  backdropUri: string | null;
}

const ActivityEditorialHeader = React.memo(({ item, isPremium, isAuteur, backdropUri }: EditorialHeaderProps) => {
  if (!(item.editorial_header || (isPremium && item.poster_path))) return null;
  return (
    <View style={s.editorialHeaderContainer}>
      <View style={s.editorialHeaderImageWrap}>
        <Image
          source={{ uri: backdropUri as string }} 
          style={[StyleSheet.absoluteFillObject, s.editorialHeaderImageStyle, !item.editorial_header && s.editorialHeaderImageFallback]}
          blurRadius={!item.editorial_header ? 15 : 0}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient colors={['rgba(11,10,8,0.3)', 'rgba(11,10,8,0.95)']} style={StyleSheet.absoluteFillObject} />
        {item.editorial_header && (
           <View style={s.editorialBadge}><Text style={s.editorialBadgeText}>✦ EDITORIAL</Text></View>
        )}
      </View>
      <LinearGradient 
         colors={['transparent', 'rgba(196,150,26,0.3)', 'transparent']} 
         start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} 
         style={s.editorialHeaderAccent} 
      />
    </View>
  );
});
ActivityEditorialHeader.displayName = 'ActivityEditorialHeader';



interface ContentBodyProps {
  item: FeedItem;
  isAuteur: boolean;
  isPremium: boolean;
  timeAgo: string;
  handleUserPress: () => void;
  handleFilmPress: () => void;
  handleLogPress: () => void;
}

const ActivityContentBody = React.memo(({ item, isAuteur, isPremium, timeAgo, handleUserPress, handleFilmPress, handleLogPress }: ContentBodyProps) => {
  return (
    <View style={s.cardInfo}>
      <UserAttributionRow
        username={item.username}
        avatarUrl={item.avatar_url}
        role={item.role}
        timeAgo={timeAgo}
        onUserPress={handleUserPress}
      />

      <View style={s.titleRow}>
        <PressableScale onPress={handleFilmPress} hitSlop={st.hitSlop} haptic="selection" pressedScale={0.96} style={st.flexShrink}>
          <Text style={s.cardTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>{item.film_title}</Text>
        </PressableScale>
        {item.year && <Text style={s.cardYear}>{item.year}</Text>}
      </View>

      <ReviewContent item={item} isPremium={isPremium} isAuteur={isAuteur} onPress={handleLogPress} />

      <View style={st.actionDeckWrap}>
        <ActionDeck
          itemId={item.id}
          filmId={item.film_id}
          filmTitle={item.film_title}
          posterPath={item.poster_path ?? null}
          year={item.year ?? undefined}
          ownerUsername={item.username}
        />
      </View>
    </View>
  );
});
ActivityContentBody.displayName = 'ActivityContentBody';

export const ActivityCard = React.memo(function ActivityCard({ item, index, parentScrollY }: { item: FeedItem; index: number; parentScrollY?: SharedValue<number> }) {
  const router = useRouter();
  const isArchivist = isArchivistPlusTier(item.role);
  const isAuteur = isAuteurPlusTier(item.role);
  const isPremium = isArchivist || isAuteur || !!item.editorial_header || !!item.pull_quote;
  
  const backdropUri = item.editorial_header ? `${TMDB_IMG_W500}${item.editorial_header}` : item.poster_path ? `${TMDB_IMG_W500}${item.poster_path}` : null;
  
  const { height: windowHeight } = useWindowDimensions();
  const animatedRef = useAnimatedRef<View>();

  const parallaxStyle = useAnimatedStyle(() => {
    if (!parentScrollY) return {};
    
    // Access value to force Reanimated babel plugin to track reactivity
     
    const _scroll = parentScrollY.value;
    
    const measurement = measure(animatedRef);
    if (!measurement) return {};

    const cardCenterScreenY = measurement.pageY + (measurement.height / 2);
    const distance = cardCenterScreenY - (windowHeight / 2);
    
    const rotateX = interpolate(distance, [-windowHeight, 0, windowHeight], [15, 0, -15], Extrapolation.CLAMP);
    const scale = interpolate(Math.abs(distance), [0, windowHeight], [1, 0.95], Extrapolation.CLAMP);
    
    return {
      transform: [
        { perspective: 1200 },
        { rotateX: `${rotateX}deg` },
        { scale }
      ]
    };
  });

  const timeAgo = useMemo(() => getTimeAgo(item.created_at), [item.created_at]);

  const handleFilmPress = useCallback(() => {
    DeviceEventEmitter.emit('reelhouse:projection-mark');
    (router.push as any)(`/film/${item.film_id}` as any);
  }, [router, item.film_id]);

  const handleUserPress = useCallback(() => {
    (router.push as any)(`/user/${item.username}` as any);
  }, [router, item.username]);

  const handleLogPress = useCallback(() => {
    (router.push as any)(`/log/${item.id}` as any);
  }, [router, item.id]);

  return (
    <View style={{ zIndex: index }}>
      <AnimatedView ref={animatedRef} style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur, parallaxStyle]}>
        <ActivityCardShell isPremium={isPremium} isAuteur={isAuteur}>
          <ActivityEditorialHeader item={item} isPremium={isPremium} isAuteur={isAuteur} backdropUri={backdropUri} />
          
          <View style={s.cardBody}>
            <PosterFrame itemId={item.id} filmId={item.film_id} posterPath={item.poster_path} isPremium={isPremium} isAuteur={isAuteur} onPress={handleFilmPress} />
            <ActivityContentBody 
              item={item} 
              isAuteur={isAuteur} 
              isPremium={isPremium} 
              timeAgo={timeAgo} 
              handleUserPress={handleUserPress} 
              handleFilmPress={handleFilmPress} 
              handleLogPress={handleLogPress} 
            />
          </View>

          {/* autopsy is unknown JSONB on the wire; AutopsyView guards shape at runtime. */}
          <AutopsyView isAutopsied={item.is_autopsied ?? undefined} autopsy={(item.autopsy ?? undefined) as Record<string, number> | undefined} />
        </ActivityCardShell>
      </AnimatedView>
    </View>
  );
});

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d AGO`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w AGO`;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: 12,
    marginBottom: 24,
    borderRadius: 4, 
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.5)',
    overflow: 'hidden',
    position: 'relative',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  cardPremium: {
    borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(10,8,4,1)',
  },
  cardAuteur: {
    borderColor: 'rgba(125,31,31,0.25)',
    backgroundColor: 'rgba(12,5,5,1)',
  },
  editorialHeaderContainer: {
    width: '100%',
    height: 100,
    position: 'relative',
  },
  editorialHeaderImageWrap: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  editorialHeaderImageFallback: {
    transform: [{ scale: 1.3 }],
    opacity: 0.35,
  },
  editorialHeaderImageStyle: {
    resizeMode: 'cover',
  },
  editorialHeaderAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  editorialBadge: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(11,10,8,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.2)',
  },
  editorialBadgeText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 2.2,
    color: 'rgba(218,165,32,0.85)',
  },
  cardBody: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 28,
    paddingTop: 40,
    gap: 32,
    zIndex: 1,
  },
  cardInfo: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: '#F2ECD8',
    lineHeight: 32,
    marginBottom: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(196,150,26, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  cardYear: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 4,
    color: colors.fog,
    marginTop: 6,
  },
});

const st = StyleSheet.create({
  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
  flexShrink: { flexShrink: 1 },
  actionDeckWrap: { marginTop: 24, width: '100%' },
});

