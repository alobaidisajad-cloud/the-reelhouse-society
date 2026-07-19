import { useQuery } from '@tanstack/react-query';
import { MemberDiscoveryService } from '@/src/services/MemberDiscoveryService';

/**
 * useNotableMembers — cached fetch of the House's most-followed public
 * members, for the empty following-feed registry. `enabled` is caller-gated
 * so the query only fires when the registry can actually show.
 */
export function useNotableMembers(enabled: boolean) {
  return useQuery({
    queryKey: ['notable-members'],
    queryFn: ({ signal }) => MemberDiscoveryService.getNotableMembers(signal),
    staleTime: 10 * 60 * 1000, // 10 min — a slow-moving list
    enabled,
  });
}
