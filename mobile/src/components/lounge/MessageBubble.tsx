import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Sparkles, Reply } from 'lucide-react-native';
import { LoungeMessage } from '@/src/stores/lounge';
import { colors } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { s } from './LoungeStyles';

const SharedCard = React.memo(({ msg }: { msg: LoungeMessage }) => {
  if (!msg.film_title && !msg.film_id) return null;
  const typeLabel = msg.type === 'film_share' ? 'FILM' : msg.type.toUpperCase().replace('_SHARE', '');
  const posterUrl = msg.film_poster ? tmdb.poster(msg.film_poster, 'w342') : null;

  return (
    <View style={s.sharedCard}>
      {posterUrl && <Image source={{ uri: posterUrl }} style={s.sharedPoster} contentFit="cover" cachePolicy="memory-disk" />}
      <View style={s.sharedInfo}>
        <View style={s.sharedTypeBadge}>
          <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          <Text style={s.sharedTypeText} numberOfLines={1}>{typeLabel}</Text>
        </View>
        <Text style={s.sharedTitle} numberOfLines={2}>{msg.film_title}</Text>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ════════════════════════════════════════════════════════════
 
const MessageBubble = React.memo(({ msg, isSelf, showAuthor, onLongPress }: {
  msg: LoungeMessage; isSelf: boolean; showAuthor: boolean;
  onLongPress: (msg: LoungeMessage) => void;
}) => {
  return (
    <View style={[s.msgWrapper, isSelf ? s.msgSelf : s.msgOther, !showAuthor && s.msgCompact]}>
      {showAuthor && !isSelf && (
        <View style={s.msgAvatar}>
          {msg.avatar_url
            ? <Image source={{ uri: msg.avatar_url }} style={s.msgAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={s.msgAvatarLetter}>{msg.username?.[0]?.toUpperCase()}</Text>
          }
        </View>
      )}

      <View style={[s.msgContentCol, isSelf && s.msgContentColSelf]}>
        {showAuthor && (
          <View style={[s.msgHeader, isSelf && s.msgHeaderSelf]}>
            <Text style={[s.msgAuthor, { flexShrink: 1 }]} numberOfLines={1}>{isSelf ? 'You' : msg.username}</Text>
            <Text style={s.msgTime}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        <PressableScale
          onLongPress={() => onLongPress(msg)}
          style={[s.msgBubble, isSelf ? s.msgBubbleSelf : s.msgBubbleOther]}
          haptic="medium"
        >
          {Boolean(msg.reply_to_content) && (
            <View style={s.replyQuote}>
              <View style={s.replyQuoteHeader}>
                <Reply size={9} color={colors.sepia} strokeWidth={2} />
                <Text style={[s.replyQuoteAuthor, { flexShrink: 1 }]} numberOfLines={1}>{msg.reply_to_username || 'Unknown'}</Text>
              </View>
              <Text style={s.replyQuoteContent} numberOfLines={2}>{msg.reply_to_content}</Text>
            </View>
          )}

          {Boolean(msg.content) && <Text style={s.msgText}>{msg.content}</Text>}
          {msg.type !== 'text' && <SharedCard msg={msg} />}
        </PressableScale>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// ACTION SHEET — Long-press menu
// ════════════════════════════════════════════════════════════

export { MessageBubble };

MessageBubble.displayName = 'MessageBubble';
SharedCard.displayName = 'SharedCard';

