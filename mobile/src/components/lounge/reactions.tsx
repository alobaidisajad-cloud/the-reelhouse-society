import { colors } from '@/src/theme/theme';
import { Flame, Heart, Quote, Star, ThumbsDown } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { LOUNGE_REACTIONS, type LoungeReaction } from '@/src/stores/lounge';

interface IconProps { size?: number; color?: string; strokeWidth?: number }

/**
 * The curated, on-theme reaction set for the Lounge. Praise reads in sepia;
 * the single critique (Panned) reads in a muted terracotta so it's clearly a
 * dissent without being aggressive. No emoji, no slang — it matches the soul.
 */
export const REACTION_META: Record<LoungeReaction, { Icon: ComponentType<IconProps>; label: string; tint: string }> = {
  bravo: { Icon: Star, label: 'BRAVO', tint: colors.sepia },
  adored: { Icon: Heart, label: 'ADORED', tint: colors.sepia },
  riveting: { Icon: Flame, label: 'RIVETING', tint: colors.sepia },
  quoted: { Icon: Quote, label: 'QUOTED', tint: colors.sepia },
  panned: { Icon: ThumbsDown, label: 'PANNED', tint: '#A8503F' },
};

export const REACTION_ORDER = LOUNGE_REACTIONS;

/** The tint for a reaction key, falling back to fog for any unknown legacy value. */
export function reactionTint(reaction: string): string {
  return (REACTION_META as Record<string, { tint: string }>)[reaction]?.tint ?? colors.fog;
}
