import { QueryClient } from '@tanstack/react-query'
import reelToast from './utils/reelToast'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: () => {
        reelToast.error('Something went wrong — please try again.')
      },
    },
  },
})
