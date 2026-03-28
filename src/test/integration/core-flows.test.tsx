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
import { useVenueStore } from '../../stores/venue'
import { useUIStore } from '../../stores/ui'
import TicketFlow from '../../components/TicketFlow'
import LogModal from '../../components/LogModal'
import { Showtime, ShowtimeSlot } from '../../types'

// Mock Zustand stores
vi.mock('../../stores/auth', () => ({
  useAuthStore: vi.fn()
}))

vi.mock('../../stores/films', () => ({
  useFilmStore: vi.fn()
}))

vi.mock('../../stores/venue', () => ({
  useVenueStore: vi.fn()
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

  it('renders TicketFlow with ticket type selection', async () => {
    const mockBookSeat = vi.fn()
    vi.mocked(useAuthStore).mockImplementation(((s?: (state: Record<string, unknown>) => unknown) => {
      if (s) return s({ isAuthenticated: true, user: { id: 'test-user' }, openSignupModal: vi.fn() })
      return { isAuthenticated: true, user: { id: 'test-user' }, openSignupModal: vi.fn() }
    }) as never)
    vi.mocked(useVenueStore).mockImplementation(((s?: (state: Record<string, unknown>) => unknown) => {
      const state = { venue: { id: 'venue-1', name: 'Test Venue', seatLayout: { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7, blockedSeats: [] } }, bookSeat: mockBookSeat }
      if (s) return s(state)
      return state
    }) as never)

    const mockShowtime: Showtime = { id: 'st-1', film: 'Dune', filmId: 2, time: '19:00', date: '2026-03-30', slots: [], durationMins: 120 }
    const mockSlot: ShowtimeSlot = { 
      id: 'slot-1', 
      time: '19:00',
      format: 'IMAX',
      ticketTypes: [
        { id: 't1', type: 'Standard', price: 15 },
        { id: 't2', type: 'VIP', price: 25 }
      ],
      bookedSeats: []
    }
    const venueSeatLayout = { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7, blockedSeats: [] }

    const testClient = new QueryClient()

    render(
      <QueryClientProvider client={testClient}>
        <BrowserRouter>
          <TicketFlow 
            showtime={mockShowtime} 
            slot={mockSlot} 
            onClose={() => {}} 
            venueSeatLayout={venueSeatLayout} 
          />
        </BrowserRouter>
      </QueryClientProvider>
    )

    // Step 1: Verify ticket type selection is available
    await waitFor(() => {
      expect(screen.getByText(/Choose Ticket Type/i)).toBeInTheDocument()
    })

    // Verify ticket types are displayed
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('VIP')).toBeInTheDocument()

    // Click VIP
    fireEvent.click(screen.getByText('VIP'))
    
    // Should advance to seat selection
    await waitFor(() => {
      expect(screen.getByText(/Pick Your Seat/i)).toBeInTheDocument()
    })
  })
})
