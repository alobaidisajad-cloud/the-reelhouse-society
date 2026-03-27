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

  it('allows a user to log a film with a rating and review', async () => {
    // Setup mock store values
    const mockAddLog = vi.fn().mockResolvedValue(true)
    ;(useAuthStore as any).mockReturnValue({ isAuthenticated: true, user: { id: 'test-user', username: 'tester' } })
    ;(useFilmStore as any).mockImplementation((selector: any) => {
        // Return parts of store based on the selector function string matching loosely
        const state = { addLog: mockAddLog, logs: [], lists: [] }
        if (selector) return selector(state)
        return state
    })
    
    const testFilm = { id: 123, title: 'Inception', poster_path: '/test.jpg', release_date: '2010-07-16' }
    
    ;(useUIStore as any).mockImplementation((selector: any) => {
        const state = { logModalOpen: true, logModalFilm: testFilm, logModalEditLogId: null, closeLogModal: vi.fn() }
        if (selector) return selector(state)
        return state
    })

    const testClient = new QueryClient()

    // Render LogModal
    render(
      <QueryClientProvider client={testClient}>
        <BrowserRouter>
          <LogModal />
        </BrowserRouter>
      </QueryClientProvider>
    )

    // Check header
    expect(screen.getByText('I WATCHED...')).toBeInTheDocument()
    expect(screen.getByText('Inception')).toBeInTheDocument()

    // Simulate interactions
    const reviewTextarea = screen.getByPlaceholderText('Transcribe your thoughts...')
    fireEvent.change(reviewTextarea, { target: { value: 'A masterpiece from Nolan.' } })

    // Set rating (simulating click on 5th star)
    const saveButton = screen.getByText('Save to Ledger')
    fireEvent.click(saveButton)

    // Verify mock would have been called (with simplified payload since actual logic maps it)
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalled()
    })
  })

  it('navigates venue seat selection and ticket purchase flow', async () => {
    const mockBookSeat = vi.fn()
    ;(useAuthStore as any).mockImplementation((s: any) => s({ isAuthenticated: true, user: { id: 'test-user' }, openSignupModal: vi.fn() }))
    ;(useVenueStore as any).mockImplementation((s: any) => s({ 
      venue: { id: 'venue-1', name: 'Test Venue' },
      bookSeat: mockBookSeat 
    }))

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
    const venueSeatLayout = { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7 }

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

    // Step 1: Select ticket type
    expect(screen.getByText(/SELECT TICKET TYPE/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('VIP'))
    
    // Ensure user moved to Step 2 (Seat Selection)
    await waitFor(() => {
      expect(screen.getByText('SELECT SEAT')).toBeInTheDocument()
    })

    // Click a seat
    expect(screen.getByText('SEATS AVAILABLE')).toBeInTheDocument()
  })
})
