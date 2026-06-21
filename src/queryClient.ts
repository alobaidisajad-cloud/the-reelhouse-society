import { QueryClient } from '@tanstack/react-query'
import reelToast from './utils/reelToast'
import { friendlyError } from './utils/errorHandling'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        reelToast.error(friendlyError(error))
      },
    },
  },
})
