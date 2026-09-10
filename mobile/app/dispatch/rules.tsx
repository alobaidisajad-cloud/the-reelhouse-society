/**
 * THE HOUSE RULES — nine clauses, and every one of them is a claim.
 * ─────────────────────────────────────────────────────────────────────────────
 * The letters page doing the job it was invented for: the numeral in the margin,
 * the clause in the column. Nothing here is designed for this screen; it is the
 * page the Dispatch already is, carrying rules instead of filings, which is why
 * it needs no explaining.
 *
 * ── IT SCROLLS, AND THE DESIGN PLATE DOES NOT ───────────────────────────────
 * `f3-house-rules` draws the same two components with no scroll view, because a
 * plate is one screenful by definition. Nine clauses come to roughly 655 points
 * at the system text size — inside a 740pt screen, and past it at the
 * accessibility ceiling, where the last two clauses and the date under them
 * would simply not exist. A page a member cannot reach the bottom of is a page
 * whose last rules are not rules.
 *
 * ── AND WHY THE FOOT IS NOT A NUMBER ────────────────────────────────────────
 * See `CLAUSES` in PaperMore: the standfirst used to say "Six" while there were
 * six, and a count in prose beside a list is a second copy of that list's
 * length. The copy is what goes stale. `everyRuleIsTrue.test.ts` fails if one
 * comes back.
 */
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack, PaperRules } from '@/src/components/dispatch/paper/PaperMore';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { nav } from '@/src/utils/typedRouter';

export default function HouseRulesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={p.screen}>
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
