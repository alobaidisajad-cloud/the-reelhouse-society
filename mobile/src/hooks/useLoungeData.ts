import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { LoungeService } from '@/src/services/LoungeService';
import { LoungeMember } from '@/src/types';

export function useLoungeData(loungeId: string | undefined, userId: string | undefined) {
  const { 
    data: loungeDetails, 
    isLoading: isLoungeLoading, 
    error: loungeError 
  } = useQuery({
    queryKey: ['lounge', loungeId],
    queryFn: () => LoungeService.getLoungeDetails(loungeId!),
    enabled: !!loungeId,
    staleTime: 5 * 60 * 1000,
  });

  const { 
    data: isMember, 
    isLoading: isMembershipLoading,
    refetch: refetchMembership
  } = useQuery({
    queryKey: ['lounge_membership', loungeId, userId],
    queryFn: () => LoungeService.checkMembership(loungeId!, userId!),
    enabled: !!loungeId && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const { 
    data: rawMembers, 
    isLoading: isMembersLoading,
    refetch: refetchMembers
  } = useQuery({
    queryKey: ['lounge_members', loungeId],
    queryFn: () => LoungeService.getLoungeMembers(loungeId!),
    enabled: !!loungeId,
    staleTime: 60 * 1000,
  });

  // Transform rawMembers to match LoungeMember[] shape used in UI
  const members: LoungeMember[] = useMemo(() => {
    return (rawMembers || []).map((m: any) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        user_id: m.user_id,
        username: profile?.username ?? 'user',
        avatar_url: profile?.avatar_url,
      };
    });
  }, [rawMembers]);

  return {
    loungeDetails,
    isLoungeLoading,
    loungeError,
    isMember: !!isMember, // normalize undefined/null to boolean
    isMembershipLoading,
    refetchMembership,
    members,
    isMembersLoading,
    refetchMembers,
  };
}
