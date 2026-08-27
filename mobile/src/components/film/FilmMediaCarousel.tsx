import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Play } from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';

interface VideoResult {
  key: string;
  name?: string;
  type: string;
}

interface VideoThumbProps {
  video: VideoResult;
  onPlay: (key: string) => void;
}

const VideoThumb = memo(function VideoThumb({ video, onPlay }: VideoThumbProps) {
  const thumb = tmdb.youtubeThumbnail(video.key);
  const handlePlay = useCallback(() => {
    TactileEngine.selection();
    onPlay(video.key);
  }, [onPlay, video.key]);

  return (
    <PressableScale onPress={handlePlay} style={sub.videoThumb} hitSlop={{top: 10, bottom: 10}} accessibilityLabel="Play video">
      <Image source={{ uri: thumb }} style={sub.videoImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      <View style={sub.videoPlayOverlay}>
        <View style={sub.videoPlayCircle}>
          <Play size={14} color={colors.parchment} fill={colors.parchment} />
        </View>
      </View>
      <View style={sub.videoLabelWrap}>
        {/**
          * ── A FIXED-HEIGHT RAIL HAS TO CAP ITS TYPE ────────────────────────
          * React Native scales text with the system setting and does NOT cap it
          * unless asked. At iOS's larger accessibility sizes an 11pt caption
          * becomes 30-odd, and this rail is a FIXED 176pt that cannot grow: the
          * captions would run straight into the section beneath. Two lines made
          * that twice as likely, so both lines are capped at the app's own 1.35.
          */}
        <Text {...scaledTextProps} style={sub.videoType}>{video.type?.toUpperCase() ?? 'VIDEO'}</Text>
        {/* Two lines. One cut a caption mid-word — "A moment for this cinematic
            d…" — which tells a member less than no caption at all. */}
        <Text {...scaledTextProps} style={sub.videoName} numberOfLines={2}>{video.name}</Text>
      </View>
    </PressableScale>
  );
});

interface FilmMediaCarouselProps {
  videos: VideoResult[];
  onPlayVideo: (key: string) => void;
}
const keyExtractor = (item: VideoResult, index: number) => `${item.key}-${index}`;

export const FilmMediaCarousel = memo(function FilmMediaCarousel({ videos, onPlayVideo }: FilmMediaCarouselProps) {
  const renderVideoItem = useCallback(({ item }: { item: VideoResult }) => (
    <VideoThumb video={item} onPlay={onPlayVideo} />
  ), [onPlayVideo]);

  if (!videos || videos.length === 0) return null;

  return (
    <SectionErrorBoundary fallbackMessage="Media could not be loaded.">
      <Animated.View style={s.sectionFlush}>
        <View style={s.sectionPadded}>
          {/* Was VIDEOS. Half this page's headings spoke the house's language
              and half spoke a stock app's; this is one of the four that did not. */}
          <FilmSectionHeader label={`THE FOOTAGE (${videos.length})`} />
        </View>
        <View style={sub.videoListContainer}>
          <FlashList
            data={videos.slice(0, 6)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractor}
            contentContainerStyle={s.horizontalList}
            estimatedItemSize={210}
            snapToInterval={210}
            snapToAlignment="start"
            decelerationRate="fast"
            renderItem={renderVideoItem}
          />
        </View>
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  sectionFlush: { marginBottom: 24, zIndex: 2 },
  sectionPadded: { paddingHorizontal: 20 },
  horizontalList: { paddingHorizontal: 20 },
});

const sub = StyleSheet.create({
  // 160 fitted a one-line caption exactly. The second line has to be paid for
  // here or it overflows the rail and collides with the section beneath —
  // a fixed-height rail does not grow to fit its contents.
  videoListContainer: { height: 176 },
  videoThumb: { width: 200, marginRight: 10 },
  videoImg: { width: 200, height: 112, borderRadius: 4, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)' },
  videoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 48, justifyContent: 'center', alignItems: 'center' },
  videoPlayCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(8,6,4,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.5)', justifyContent: 'center', alignItems: 'center' },
  videoLabelWrap: { marginTop: 8 },
  videoType: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
  videoName: { fontFamily: fonts.body, fontSize: 11, color: colors.bone },
});
