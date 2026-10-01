/**
 * THE HOUSE RULES — every clause is a claim.
 * ─────────────────────────────────────────────────────────────────────────────
 * The letters page doing the job it was invented for: the numeral in the margin,
 * the clause in the column. Nothing here is designed for this screen; it is the
 * page the Dispatch already is, carrying rules instead of filings, which is why
 * it needs no explaining.
 *
 * ── IT SCROLLS, AND THE DESIGN PLATE DOES NOT ───────────────────────────────
 * `f3-house-rules` draws the same two components with no scroll view, because a
 * plate is one screenful by definition. The clauses fit a 740pt screen at the
 * system text size and run past it at the accessibility ceiling, where the last
 * of them and the date would not exist without the scroll.
 *
 * ── AND WHY THE FOOT IS NOT A NUMBER ────────────────────────────────────────
 * A count in prose beside a list is a second copy of the list's length, and the
 * copy goes stale (see `CLAUSES` in PaperMore). `everyRuleIsTrue.test.ts` fails
 * if one comes back.
 */
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack, PaperRules } from '@/src/components/dispatch/paper/PaperMore';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { nav } from '@/src/utils/typedRouter';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

export default function HouseRulesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
      <PaperBack label="THE HOUSE RULES" onBack={() => nav.back()} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* `flexGrow` on the content and `flex: 1` inside the sheet, so a short
            page still reaches the foot: without it the document ends wherever
            the clauses end and raw ink shows beneath it, with the side rails
            stopping in mid-air. */}
        <PaperSheet>
          <PaperRules />
        </PaperSheet>
      </ScrollView>
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
