/**
 * letTheRecordGo — a record the house says is gone leaves the phone.
 *
 * A critique filed on a record deleted meanwhile is answered LOG_GONE (goneFromTheHouse): the
 * record's page is read as gone, it leaves the Reel, the wall and every list told of records
 * withdrawn, and, were it the member's own (deleted from their other phone), their archive on this
 * phone, as an amendment that finds its record gone lets it go (round 11). One way for both who
 * hear it: the record's page, filing online, and the offline queue, sending a critique written
 * while the wire was down (review round 12).
 */
import type { QueryClient } from '@tanstack/react-query';
import { useFilmStore } from '@/src/stores/films';
import { reelMayHaveChanged } from '@/src/components/feed/reelRead';
import { wallMayHaveChanged } from '@/src/components/lobby/wallRead';

export function letTheRecordGo(queryClient: QueryClient, id: string): void {
  // The page's read, its record gone: whatever else it held (critiques, marks) as it was.
  queryClient.setQueryData<{ log: unknown }>(['log', id], (old) => (old ? { ...old, log: null } : old));
  const { logs, _loggedIndex } = useFilmStore.getState();
  const held = logs.find((l) => l.id === id) ?? Object.values(_loggedIndex).find((l) => l?.id === id);
  if (held) {
    useFilmStore.setState((state) => {
      const nextIdx = { ...state._loggedIndex };
      if (held.filmId !== undefined && nextIdx[held.filmId]?.id === id) delete nextIdx[held.filmId];
      return { logs: state.logs.filter((l) => l.id !== id), _loggedIndex: nextIdx };
    });
  }
  wallMayHaveChanged();
  reelMayHaveChanged(id);
}
