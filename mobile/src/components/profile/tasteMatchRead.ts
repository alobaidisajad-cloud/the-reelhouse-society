/**
 * tasteMatchRead — TASTE COMPATIBILITY, over both members' whole records.
 *
 * The card compared the logs each phone happened to hold: the viewer's loaded
 * page and the first page of the other member's. Two members with thousands of
 * films each were matched on a hundred. get_taste_match answers, for both, how
 * many films they rated each whole reel and how many they logged from each
 * decade; the comparison is the same, on everything.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';

const ShapeSchema = z.object({
  logs: z.number(),
  ratings: z.array(z.number()).length(5),
  decades: z.record(z.string(), z.number()),
});
export type TasteShape = z.infer<typeof ShapeSchema>;
const AnswerSchema = z.object({ mine: ShapeSchema, theirs: ShapeSchema });
export type TasteAnswer = z.infer<typeof AnswerSchema>;

/** Under this many logs on either side, there is too little to compare. */
export const TASTE_FLOOR = 5;

/**
 * Both shapes, or null when the viewer may not read this member's record (the
 * card has nothing to say). A read that failed is thrown, never taken for null.
 */
export async function readTasteMatch(userId: string): Promise<TasteAnswer | null> {
  const { data, error } = await supabase.rpc('get_taste_match', { p_user_id: userId });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) return null;
  return AnswerSchema.parse(data);
}

export function useTasteMatch(userId: string | null | undefined) {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ['tasteMatch', userId],
    queryFn: () => readTasteMatch(userId as string),
    enabled: signedIn && !!userId,
    staleTime: 10 * 60 * 1000,
  });
}

function cosine(a: number[], b: number[]) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** How alike two records are, 0–100: how they rate, half; which decades they watch, half. Null under the floor. */
export function tasteMatchOf(mine: TasteShape, theirs: TasteShape): number | null {
  if (mine.logs < TASTE_FLOOR || theirs.logs < TASTE_FLOOR) return null;
  const share = (counts: number[]) => {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return counts.map((c) => c / total);
  };
  const ratingMatch = cosine(share(mine.ratings), share(theirs.ratings));
  const decades = [...new Set([...Object.keys(mine.decades), ...Object.keys(theirs.decades)])];
  const decadeMatch = cosine(decades.map((d) => mine.decades[d] ?? 0), decades.map((d) => theirs.decades[d] ?? 0));
  return Math.round((ratingMatch * 0.5 + decadeMatch * 0.5) * 100);
}
