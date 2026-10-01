import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, X } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { r, roomTier, chipSlop } from './roomStyles';
import { TryAgainLine } from '@/src/components/TryAgain';

/**
 * RoomParts — the furniture every room is built from.
 *
 * One plate, one chip, one rail, one set of states, one foot. What makes each
 * room itself lives in that room: the Oracle, the spines, the shelves, the
 * Certificate, the ledger row.
 */

// ════════════════════════════════════════════════════════════════════════════
// THE ROOM PLATE
// ════════════════════════════════════════════════════════════════════════════
export function RoomPlate({
  name, member, count, sealed, tier, onBack,
}: {
  /** THE ARCHIVE, THE LEDGER … */
  name: string;
  /** Whose room this is. You always know, on your own file or anyone's. */
  member: string;
  /**
   * The RECONCILED count — `tally(totalFilms)`, never `logs.length` (the rooms
   * hold windows capped at 150): the number the profile shows, from its source.
   */
  count: string;
  sealed?: boolean;
  tier?: string | null;
  onBack: () => void;
}) {
  const t = roomTier(tier);
  return (
    <>
      <View style={r.plate}>
        <PressableScale
          onPress={onBack}
          style={r.plateBack}
          // Icon-only: with no text child it would announce nothing at all,
          // and this is the control that leaves the room.
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Back to the member file"
        >
          <ChevronLeft size={22} color={colors.sepia} strokeWidth={1.6} />
        </PressableScale>
        <View style={r.plateText}>
          {/* It may give back what large type added — down to its designed
              size, no smaller. At 0.8 "The Cinematic Passport" still lost its
              last letters on a 320pt phone at large type. */}
          <Text {...scaledTextProps} style={r.plateName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={1 / scaledTextProps.maxFontSizeMultiplier}>
            {name}
          </Text>
          <Text {...scaledTextProps} style={r.plateSub} numberOfLines={1}>
            {/* A nested Text takes the PARENT's size, so it has to take the
                parent's ceiling too — without it the count grows past 1.35
                while the name beside it stops, and the line breaks apart. */}
            {member} · <Text {...scaledTextProps} style={r.plateCount}>{count}</Text>{sealed ? ' · SEALED' : ''}
          </Text>
        </View>
      </View>

      <View style={r.plateRail}>
        <LinearGradient
          colors={['transparent', t.edge, t.edge]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={r.plateRailLine}
        />
        <View style={[r.plateRailMark, { backgroundColor: t.ink }]} />
        <LinearGradient
          colors={[t.edge, t.edge, 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={r.plateRailLine}
        />
      </View>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// A CHIP
// ════════════════════════════════════════════════════════════════════════════
export function RoomChip({
  label, count, on, onPress, gap, a11y, children,
}: {
  label?: string;
  count?: number | string;
  on: boolean;
  onPress: () => void;
  /** The container's real gap — the chip may claim half of it, never more. */
  gap: number;
  a11y: string;
  /** For a chip whose face is not text, such as the ledger's rating reels. */
  children?: React.ReactNode;
}) {
  return (
    <PressableScale
      style={[r.chip, on && r.chipOn]}
      onPress={onPress}
      // Half the gap sideways so two chips meet without overlapping; the rest
      // spent on height, where a horizontal scroller has no neighbour to
      // collide with. Derived in roomStyles so respacing a row respaces its
      // targets — see `chipSlop`, and the sweep that proves it.
      hitSlop={chipSlop(gap)}
      haptic
      accessibilityRole="button"
      accessibilityLabel={a11y}
      // A filter says whether it is ON, not only what it is called.
      accessibilityState={{ selected: on }}
    >
      {children ?? (
        <Text {...scaledTextProps} style={[r.chipText, on && r.chipTextOn]} numberOfLines={1}>
          {label}
          {count !== undefined && <Text {...scaledTextProps} style={r.chipCount}>  {count}</Text>}
        </Text>
      )}
      {on && <View style={r.chipUnderline} pointerEvents="none" />}
    </PressableScale>
  );
}

/**
 * A hairline between two GROUPS of chips in one scroller: in what ORDER, and
 * WHICH ones, asked in one row rather than two (header rows before the first
 * poster are what a room can least afford). The cost is 1pt.
 */
export function RoomChipDivider() {
  return <View style={r.chipDivider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

// ════════════════════════════════════════════════════════════════════════════
// SEARCH — the way IN, not a convenience
// ════════════════════════════════════════════════════════════════════════════
/**
 * The one search box of every room. With 2,000 films or 300 stacks, scrolling
 * is not navigation; past one screenful this is the primary control.
 *
 * Every term reaches the server through `buildSearchPattern` (the one
 * sanitiser) and is matched on the phone by `matchesSearch`; nothing here
 * builds a query. The debounce lives with each room; the shape lives here, so
 * five rooms cannot have five boxes that look and behave differently.
 */
export function RoomSearch({ value, onChange, onClear, placeholder, a11y, ember }: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  placeholder: string;
  a11y: string;
  /** The breathing icon, animated by the room that owns the timing. */
  ember?: React.ReactNode;
}) {
  return (
    <View style={r.search}>
      {ember}
      <TextInput
        style={r.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.fog}
        selectionColor={colors.sepia}
        keyboardAppearance="dark"
        accessibilityLabel={a11y}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        // A search box is not a place to be autocorrected into a different film.
        spellCheck={false}
      />
      {value.length > 0 && (
        <PressableScale
          onPress={onClear}
          style={r.searchClear}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Clear the search"
        >
          <X size={14} color={colors.fog} strokeWidth={1.5} />
        </PressableScale>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// A RAIL — a month in the Archive, a shelf in the Vault
// ════════════════════════════════════════════════════════════════════════════
export function RoomRail({ lead, label, count, tint, weight }: {
  /** The year, set in the display face — or nothing, for a shelf. */
  lead?: string;
  label: string;
  /**
   * How heavy this month was, or how many discs stand on this shelf.
   *
   * UNDEFINED when the true figure is not knowable — see `completeCount`. The
   * rail then simply has no number, rather than repeating the count of
   * whichever rows happened to have loaded.
   */
  count?: string;
  /** A shelf takes its FORMAT's colour; a month stays brass. */
  tint?: string;
  /**
   * 0–1: this month against the member's heaviest, ever.
   *
   * A hundred and eighty of these scroll past someone with fifteen years of
   * viewing, and every one of them looked identical — a month they went three
   * times a week read exactly like a month they went twice. One 2pt rule turns
   * a list into a shape you can feel with your thumb.
   *
   * Omitted entirely when the counts are not knowable: a rhythm drawn from
   * partial figures is a prettier lie than a wrong number.
   */
  weight?: number;
}) {
  const hasWeight = typeof weight === 'number' && weight > 0;
  return (
    <View style={hasWeight ? r.railWrap : undefined}>
      <View style={[r.rail, hasWeight && r.railTight]} accessible accessibilityRole="header">
        {!!lead && <Text {...scaledTextProps} style={r.railYear}>{lead}</Text>}
        <View style={[r.railLine, tint ? { backgroundColor: tint, opacity: 0.45 } : null]} />
        {/* Bounded like the chip beside it. Most rails carry a month name or
            one of seven shelf formats, but the Vault's label falls back to the
            raw `format` string from the row, and that column is only capped at
            5000 characters with no whitelist — so the one label on the page a
            member can author is the one that could push the count off screen.
            A header row should never wrap regardless of what reaches it. */}
        <Text {...scaledTextProps} style={[r.railLabel, tint ? { color: tint } : null]} numberOfLines={1}>{label}</Text>
        {!!count && <Text {...scaledTextProps} style={r.railCount}>{count}</Text>}
      </View>
      {hasWeight && (
        // Decorative only — the count beside it already says the number, so a
        // screen reader announcing this too would just repeat itself.
        <View style={r.rhythm} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[r.rhythmFill, { width: `${Math.max(2, Math.min(100, weight * 100))}%` }]} />
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STATES
// ════════════════════════════════════════════════════════════════════════════
/** The moment before the data lands. Says nothing about the room's contents. */
export function RoomRetrieving({ room }: { room: string }) {
  return (
    <View style={r.retrieve} accessible accessibilityRole="progressbar" accessibilityLabel={`Retrieving ${room}`}>
      <Text {...decorativeTextProps} style={r.retrieveMark}>✦</Text>
      <Text {...scaledTextProps} style={r.retrieveText}>RETRIEVING {room.toUpperCase()}</Text>
      <Text {...decorativeTextProps} style={r.retrieveMark}>✦</Text>
    </View>
  );
}

/** A room whose read could not be answered: said, with the way to ask again. */
export function RoomUnreachable({ room, onRetry }: { room: string; onRetry: () => void }) {
  return (
    <View style={r.state}>
      <Text {...scaledTextProps} style={r.stateBody}>{`${room[0].toUpperCase()}${room.slice(1)} could not be reached.`}</Text>
      <TryAgainLine onPress={onRetry} accessibilityLabel={`Ask for ${room} again`} style={r.stateRetry} />
    </View>
  );
}

/**
 * A private member's room: never "hasn't watched any films yet". The plate
 * states the true number (the counts are read on the sealed path) and this
 * explains the rest.
 */
export function RoomSealed() {
  return (
    <View style={[r.state, r.stateInvite]}>
      <Text {...scaledTextProps} style={r.stateSeal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        ✦ THIS DOSSIER IS SEALED ✦
      </Text>
      <Text {...scaledTextProps} style={r.stateBody}>
        The member keeps their records private.{'\n'}Follow to request the key.
      </Text>
    </View>
  );
}

/**
 * An empty room — and, separately, a room whose FILTER matched nothing. Those
 * are different facts with different sentences ("The Archive is Empty" sends a
 * member with 200 films hunting for a fault in their account); when a filter is
 * the cause, the action offered is the one that undoes it.
 */
export function RoomEmpty({ icon, title, body, actionLabel, onAction, invite }: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Your own room, or a filter you can clear: dashed and warmer. */
  invite?: boolean;
}) {
  return (
    <View style={[r.state, invite && r.stateInvite]}>
      {icon}
      <Text {...scaledTextProps} style={r.stateTitle}>{title}</Text>
      {!!body && <Text {...scaledTextProps} style={r.stateBody}>{body}</Text>}
      {!!actionLabel && !!onAction && (
        <PressableScale
          style={r.stateAct}
          onPress={onAction}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text {...scaledTextProps} style={r.stateActText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {actionLabel}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// THE FOOT — every room closes
// ════════════════════════════════════════════════════════════════════════════
/** "More" that could not be read: said at the foot, with the way to ask again. */
export function RoomMoreFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={r.state}>
      <Text {...scaledTextProps} style={r.stateBody}>The rest could not be reached.</Text>
      {!!onRetry && <TryAgainLine onPress={onRetry} accessibilityLabel="Ask for the rest again" style={r.stateRetry} />}
    </View>
  );
}

export function RoomFoot({ tier }: { tier?: string | null }) {
  const t = roomTier(tier);
  return (
    <View style={r.foot} accessible={false}>
      <View style={[r.footRule, { backgroundColor: t.edge }]} />
      <Text {...decorativeTextProps} style={[r.footMark, { color: t.ink }]}>✦</Text>
      <View style={[r.footRule, { backgroundColor: t.edge }]} />
    </View>
  );
}

/** The Stacks' and the shelf's paginator: LOAD MORE, and a spinner while it works. */
export function RoomLoadMore({ busy, onPress }: { busy?: boolean; onPress?: () => void }) {
  return (
    <PressableScale
      style={r.loadMore}
      onPress={onPress}
      disabled={busy}
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Loading more' : 'Load more'}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
    >
      {busy
        ? <ActivityIndicator color={colors.sepia} />
        : <Text {...scaledTextProps} style={r.loadMoreText}>LOAD MORE</Text>}
    </PressableScale>
  );
}
