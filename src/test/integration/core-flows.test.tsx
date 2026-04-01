import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

// Mock matchMedia BEFORE evaluating module imports
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

import { useAuthStore } from '../../stores/auth'
import { useFilmStore } from '../../stores/films'
import { useUIStore } from '../../stores/ui'
import LogModal from '../../components/LogModal'

// Mock Zustand stores
vi.mock('../../stores/auth', () => ({
  useAuthStore: vi.fn()
}))

vi.mock('../../stores/films', () => ({
  useFilmStore: vi.fn()
}))

vi.mock('../../stores/ui', () => ({
  useUIStore: vi.fn()
}))

describe('Core Flows Integration', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LogModal with film poster and title when opened', async () => {
    // Setup mock store values
    const mockAddLog = vi.fn().mockResolvedValue(true)
    vi.mocked(useAuthStore).mockReturnValue({ isAuthenticated: true, user: { id: 'test-user', username: 'tester' } } as never)
    vi.mocked(useFilmStore).mockImplementation(((selector?: (s: Record<string, unknown>) => unknown) => {
        const state = { addLog: mockAddLog, logs: [], lists: [], updateLog: vi.fn() }
        if (selector) return selector(state)
        return state
    }) as never)
    
    const testFilm = { id: 123, title: 'Inception', poster_path: '/test.jpg', release_date: '2010-07-16' }
    
    vi.mocked(useUIStore).mockImplementation(((selector?: (s: Record<string, unknown>) => unknown) => {
        const state = { logModalOpen: true, logModalFilm: testFilm, logModalEditLogId: null, closeLogModal: vi.fn() }
        if (selector) return selector(state)
        return state
    }) as never)

    const testClient = new QueryClient()

    render(
      <QueryClientProvider client={testClient}>
        <BrowserRouter>
          <LogModal />
        </BrowserRouter>
      </QueryClientProvider>
    )

    // Check modal rendered with film title and poster
    await waitFor(() => {
      expect(screen.getByText('Inception')).toBeInTheDocument()
    })

    // Verify poster image is rendered with the correct alt text
    const img = screen.getByAltText('Inception')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('test.jpg')
  })

  // Legacy TicketFlow test removed — cinema/venue system replaced by The Lounge
})
