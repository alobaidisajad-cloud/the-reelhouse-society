/**
 * noticeChannels — Android's notice channels: one per kind of notice, each with its own weight.
 *
 * A member sees these in the phone's settings and turns each on or off, louder or quieter: a
 * single channel at the highest importance made every certification ring like a warning. They are
 * created when the app starts, before any notice can arrive, so a notice never lands in a channel
 * Android does not know. notify-push sends each kind to its channel (KIND_CHANNEL, the same map;
 * theNoticesKnowTheirChannels.test.ts holds the two equal). A later build may add a channel, never
 * remove one: an installed build would miss its notices.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { colors } from '../theme/theme';
import { logger } from '../utils/logger';

/** Android's importance levels, as expo-notifications numbers them. */
const LOW = 2;
const DEFAULT = 3;
const HIGH = 4;

export type NoticeChannel = { id: string; name: string; description: string; importance: number };

export const NOTICE_CHANNELS: readonly NoticeChannel[] = [
  { id: 'critiques', name: 'Critiques and replies', description: 'A critique, a note or a reply on what you filed', importance: HIGH },
  { id: 'members', name: 'Members', description: 'A member follows you, asks to, or admits you', importance: DEFAULT },
  { id: 'honours', name: 'Certifications and honours', description: 'Your work certified, reacted to or featured', importance: LOW },
  { id: 'the-house', name: 'From the house', description: 'Word from the house about your membership and the rules', importance: HIGH },
  { id: 'default', name: 'Other notices', description: 'Anything the house sends that has no channel of its own', importance: DEFAULT },
];

/** Each kind of notice (notifications.type) and the channel it arrives in. */
export const KIND_CHANNEL: Readonly<Record<string, string>> = {
  comment: 'critiques',
  annotate: 'critiques',
  retransmit: 'critiques',
  follow: 'members',
  follow_request: 'members',
  follow_accept: 'members',
  endorse: 'honours',
  reaction: 'honours',
  featured: 'honours',
  system: 'the-house',
  moderation: 'the-house',
};

/** Every channel, created once at start on Android; elsewhere nothing. Never throws. */
export async function ensureNoticeChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Promise.all(NOTICE_CHANNELS.map((c) => Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      description: c.description,
      importance: c.importance,
      vibrationPattern: c.importance >= HIGH ? [0, 250, 250, 250] : undefined,
      lightColor: colors.champagne,
    })));
  } catch (e) {
    logger.warn('[Push] notice channels could not be created', e);
  }
}
