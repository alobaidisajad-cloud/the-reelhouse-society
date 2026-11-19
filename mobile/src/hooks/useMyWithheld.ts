/**
 * useMyWithheld — the member's own pieces the house withholds (round 14), so every page of theirs marks
 * each as withheld, never as if it stood public: a member must never believe others can read what the
 * house withholds. One read for the member (get_my_withheld_pieces), keyed on who asks. A page (a log, a
 * stack, a filing, a member's own room) reads it again as it opens; a row in a list reads what the page
 * read, never again for itself (a list of fifty would ask fifty times). An appeal filed reads it again
 * (VerdictSheet).
 *
 * The read keeps the list as the house sends it: the phone's cache is written to its store as JSON and
 * read back at the next start, and a Map would come back an empty object, which no row could ask. Each
 * reader turns the list into its lookup by piece.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModerationService, type WithheldPiece } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';

/** The first word of the read's key, which a test standing in for the cache answers by. */
export const MY_WITHHELD = 'my-withheld';

/** The query's key: the member's own, never another's who signs in on this phone. */
export const myWithheldKey = (memberId: string | null | undefined) => [MY_WITHHELD, memberId ?? null] as const;

export function useMyWithheld({ reread = false }: { reread?: boolean } = {}): Map<string, WithheldPiece> {
  const memberId = useAuthStore((s) => s.user?.id ?? null);
  const { data } = useQuery({
    queryKey: myWithheldKey(memberId),
    queryFn: (): Promise<WithheldPiece[]> => ModerationService.getMyWithheldPieces(),
    enabled: !!memberId,
    refetchOnMount: reread ? 'always' : false,
    staleTime: reread ? 0 : Infinity,
  });
  return useMemo(() => new Map((data ?? []).map((w) => [w.piece_id, w])), [data]);
}

/** One piece of the member's, withheld, or null. A page passes reread; a row does not. */
export function useWithheldPiece(pieceId: string | null | undefined, opts?: { reread?: boolean }): WithheldPiece | null {
  const all = useMyWithheld(opts);
  return (pieceId && all.get(pieceId)) || null;
}

