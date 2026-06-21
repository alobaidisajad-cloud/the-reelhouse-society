/**
 * ContentSkeleton — Compositional skeleton layouts for loading states.
 * ───────────────────────────────────────────────────────────────────
 * Replaces bare ActivityIndicator spinners across the app
 * with content-shaped placeholder layouts that match the Nitrate Noir aesthetic.
 *
 * Built on top of the existing SkeletonPulse component.
 *
 * Usage:
 *   import { ContentSkeleton } from '@/src/components/ContentSkeleton';
 *   {loading && <ContentSkeleton layout="list-row" count={5} />}
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonPulse from './SkeletonPulse';

type SkeletonLayout =
  | 'card'          // Film card with poster + title + subtitle
  | 'list-row'      // Avatar + two lines (notifications, followers)
  | 'poster-grid'   // 2x3 grid of poster placeholders (collections, watchlist)
  | 'chat-bubble'   // Alternating left/right chat bubbles (lounge)
  | 'profile-header' // Large avatar + stats row + bio lines
  | 'detail-hero';   // Full-width hero image + title + meta lines

interface ContentSkeletonProps {
  layout: SkeletonLayout;
  /** How many items to render. Default: 3 */
  count?: number;
}

// ── Layout Renderers ──

function CardSkeleton() {
  return (
    <View style={sk.card}>
      <SkeletonPulse width="100%" height={180} borderRadius={6} />
      <View style={sk.cardBody}>
        <SkeletonPulse width="75%" height={14} borderRadius={3} />
        <SkeletonPulse width="50%" height={10} borderRadius={3} />
      </View>
    </View>
  );
}

function ListRowSkeleton() {
  return (
    <View style={sk.row}>
      <SkeletonPulse width={40} height={40} borderRadius={20} />
      <View style={sk.rowText}>
        <SkeletonPulse width="65%" height={12} borderRadius={3} />
        <SkeletonPulse width="40%" height={10} borderRadius={3} />
      </View>
    </View>
  );
}

function PosterGridSkeleton() {
  return (
    <View style={sk.grid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonPulse key={i} width="30%" height={160} borderRadius={4} style={sk.poster} />
      ))}
    </View>
  );
}

function ChatBubbleSkeleton({ index }: { index: number }) {
  const isLeft = index % 2 === 0;
  return (
    <View style={[sk.bubble, isLeft ? sk.bubbleLeft : sk.bubbleRight]}>
      {isLeft && <SkeletonPulse width={28} height={28} borderRadius={14} />}
      <SkeletonPulse
        width={isLeft ? '55%' : '45%'}
        height={isLeft ? 36 : 28}
        borderRadius={12}
      />
    </View>
  );
}

function ProfileHeaderSkeleton() {
  return (
    <View style={sk.profileHeader}>
      <SkeletonPulse width={80} height={80} borderRadius={40} />
      <View style={sk.profileStats}>
        <SkeletonPulse width={50} height={12} borderRadius={3} />
        <SkeletonPulse width={50} height={12} borderRadius={3} />
        <SkeletonPulse width={50} height={12} borderRadius={3} />
      </View>
      <SkeletonPulse width="60%" height={14} borderRadius={3} />
      <SkeletonPulse width="80%" height={10} borderRadius={3} />
      <SkeletonPulse width="45%" height={10} borderRadius={3} />
    </View>
  );
}

function DetailHeroSkeleton() {
  return (
    <View style={sk.detailHero}>
      <SkeletonPulse width="100%" height={220} borderRadius={0} />
      <View style={sk.detailBody}>
        <SkeletonPulse width="70%" height={18} borderRadius={3} />
        <SkeletonPulse width="45%" height={12} borderRadius={3} />
        <SkeletonPulse width="90%" height={10} borderRadius={3} />
        <SkeletonPulse width="85%" height={10} borderRadius={3} />
      </View>
    </View>
  );
}

// ── Layout Map ──

const layoutMap: Record<SkeletonLayout, React.FC<{ index: number }>> = {
  'card': CardSkeleton,
  'list-row': ListRowSkeleton,
  'poster-grid': PosterGridSkeleton,
  'chat-bubble': ChatBubbleSkeleton,
  'profile-header': ProfileHeaderSkeleton,
  'detail-hero': DetailHeroSkeleton,
};

// ── Main Component ──

export function ContentSkeleton({ layout, count = 3 }: ContentSkeletonProps) {
  const Layout = layoutMap[layout];
  return (
    <View style={sk.container}>
      {Array.from({ length: count }).map((_, i) => (
        <Layout key={i} index={i} />
      ))}
    </View>
  );
}

// ── Styles ──

const sk = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Card
  card: {
    marginBottom: 16,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardBody: {
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6,
  },
  // List row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 6,
  },
  // Poster grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  poster: {
    marginBottom: 8,
  },
  // Chat bubble
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  // Profile header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginVertical: 8,
  },
  // Detail hero
  detailHero: {
    marginBottom: 16,
  },
  detailBody: {
    paddingTop: 12,
    gap: 8,
  },
});
