import React from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, X } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { r, roomTier, chipSlop } from './roomStyles';

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
   * The RECONCILED count — `tally(totalFilms)`, not `logs.length`.
   *
   * The rooms are handed windowed arrays capped at 150, so a member with 247
   * films would have been told 150 by any count taken from the list itself.
   * This is the same number their profile shows, from the same source.
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
          <Text {...scaledTextProps} style={r.plateName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
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
      // The gap that mattered more than the missing names: a filter that says
      // what it is called but never whether it is ON.
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
 * A hairline between two GROUPS of chips in one scroller.
 *
 * The Watchlist has to ask two different questions — in what ORDER, and WHICH
 * ones — and the honest layout for that is two rows. But the loudest complaint
 * about this app is header chrome: eight rows before content on the Stacks, and
 * a search box plus two chip rows here would be three before a single poster.
 * One row, two groups, a rule between them: the cost is 1pt.
 */
export function RoomChipDivider() {
  return <View style={r.chipDivider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

// ════════════════════════════════════════════════════════════════════════════
// SEARCH — the way IN, not a convenience
// ════════════════════════════════════════════════════════════════════════════
/**
 * Three of the six rooms had no way to find anything.
 *
 * With 2,000 films in the Archive or 300 stacks on the shelf, scrolling is not
 * navigation — it is the absence of it. Sorting A–Z means scrolling to "N" by
 * hand. So this is not a nicety for large collections; past one screenful it is
 * the primary control and everything else is secondary.
 *
 * Every term goes through `buildSearchPattern` at the call site — the one
 * sanitiser in the app, hardened against a live injection that turned a search
 * for four letters into "match every member". Nothing here builds a query.
 *
 * The debounce lives with the caller because each room's ANR budget differs;
 * what lives here is the shape, so five rooms cannot end up with five search
 * boxes that look and behave differently. They did once: two rooms had one,
 * three had none, and the two that had one used different placeholder voices.
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
      <View style={[r.rail, hasWeight && r.railTight]} accessibilityRole="header">
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
    <View style={r.retrieve} accessibilityRole="progressbar" accessibilityLabel={`Retrieving ${room}`}>
      <Text {...decorativeTextProps} style={r.retrieveMark}>✦</Text>
      <Text {...scaledTextProps} style={r.retrieveText}>RETRIEVING {room.toUpperCase()}</Text>
      <Text {...decorativeTextProps} style={r.retrieveMark}>✦</Text>
    </View>
  );
}

/**
 * A private member's room.
 *
 * It used to say "this member hasn't watched any films yet" — to a visitor
 * looking at someone with two thousand of them. The counts ARE fetched on the
 * sealed path, deliberately, so that the profile does not read "0 films"; the
 * rooms simply never used them. The plate states the true number and this
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
 * An empty room — and, separately, a room whose FILTER matched nothing.
 *
 * Those are different facts and today they share one sentence: filter the
 * Archive to "Abandoned" with nothing abandoned and it reports "The Archive is
 * Empty", which sends a member hunting for a fault in their own account. When
 * a filter is the cause, the only action offered is the one that undoes it.
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

/** The Stacks' and the Vault's paginator. Silent while it works, until now. */
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
