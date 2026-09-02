/**
 * The old address for a dossier, kept as a door.
 * ─────────────────────────────────────────────────────────────────────────────
 * The reader lives at `/dispatch/[id]` now, because a dossier stopped being its
 * own kind of thing — it is one of five kinds of filing and shares a table, a
 * card, a critique list and a set of acts with the other four.
 *
 * This address cannot simply go. It is written into:
 *
 *   · every notification already in the database, through `groupRoute`
 *   · every lounge message that quotes a dossier (`lounge/[id].tsx`)
 *   · the deep-link allowlist, and therefore any share card already sent
 *
 * None of those can be rewritten — some are on other people's phones. So the
 * address stays and forwards.
 *
 * REPLACE, not push. A redirect that pushes leaves this screen underneath, so
 * the back gesture returns to a page whose only job is to leave again — and on
 * the second press it forwards once more. The member is trapped in a door.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { p } from '@/src/components/dispatch/paper/paperStyles';
import { nav } from '@/src/utils/typedRouter';

export default function DossierRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    // Without an id there is nothing to forward to, so this goes back rather
    // than to a reader that would immediately show "no longer here".
    if (id) nav.replace(`/dispatch/${id}`);
    else nav.back();
  }, [id]);

  // The house's ground, for the single frame between mount and replace. A white
  // flash here would be the only white frame anywhere in the app.
  return <View style={p.screen} />;
}
