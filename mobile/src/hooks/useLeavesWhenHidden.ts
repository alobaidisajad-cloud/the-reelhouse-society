/**
 * useLeavesWhenHidden — a page that is one member's work leaves once that member is hidden.
 *
 * A log, a stack, a filing and a series are each their author's. Blocking or muting the author
 * (from the page's own ···, from a report that also blocks, or from anywhere else) left the page
 * standing with their words under the toast "Their content is now hidden" (review round 6): only
 * the Dispatch reader left, and only on BLOCK. The page now leaves on any of them, as the series
 * page did, and while it is leaving it is drawn as loading, never as their work.
 *
 * `waitFor` holds the leaving while a sheet of the page's own is open (the report sheet blocks
 * before it closes): a screen is never taken from under a Modal still on it (the iPhone's
 * two-Modal trap, round 1). It leaves as the sheet closes.
 */
import { useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useBlockStore } from '@/src/stores/blockStore';
import { useWhoIsHidden } from '@/src/utils/filterContentByBlocks';
import { nav } from '@/src/utils/typedRouter';

export function useLeavesWhenHidden(authorId: string | null | undefined, waitFor = false): boolean {
  const whoIsHidden = useWhoIsHidden();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- whoIsHidden is the change that redraws it; isHidden reads the block store itself
  const hidden = useMemo(() => !!authorId && useBlockStore.getState().isHidden(authorId), [authorId, whoIsHidden]);
  useFocusEffect(useCallback(() => { if (hidden && !waitFor) nav.back(); }, [hidden, waitFor]));
  return hidden;
}
