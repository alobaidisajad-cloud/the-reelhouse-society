/**
 * a-taste-match-reads-both-records.test.tsx — the website's TASTE COMPATIBILITY, on everything.
 *
 * It compared the viewer's loaded logs with the member's first page. It now asks
 * get_taste_match for both whole records. A record the viewer may not read gives
 * no card; a comparison that could not be read says so and is asked again on a
 * press. (The app holds the same rule: mobile aTasteMatchReadsBothRecords.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('../store', () => ({ useAuthStore: (sel: (s: { isAuthenticated: boolean }) => unknown) => sel({ isAuthenticated: true }) }))

import TasteMatch, { tasteMatchOf } from '../components/profile/TasteMatch'

const seventies = { logs: 2000, ratings: [0, 0, 100, 900, 1000], decades: { '1970': 1800, '1990': 200 } }
const answer = { data: { mine: seventies, theirs: seventies }, error: null }

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}><TasteMatch userId="them" theirUsername="vesper" /></QueryClientProvider>)
}

beforeEach(() => rpc.mockReset())

describe('the website\'s taste match reads both whole records', () => {
    it('compares like the app: identical records are wholly alike, five logs is the floor', () => {
        expect(tasteMatchOf(seventies, seventies)).toBe(100)
        expect(tasteMatchOf(seventies, { logs: 4, ratings: [0, 0, 0, 4, 0], decades: { '1970': 4 } })).toBeNull()
    })

    it('asks for both records by the member, and shows the match', async () => {
        rpc.mockResolvedValue(answer)
        mount()
        expect(await screen.findByText('100%')).toBeTruthy()
        expect(rpc).toHaveBeenCalledWith('get_taste_match', { p_user_id: 'them' })
    })

    it('says it is comparing while the records are read', async () => {
        let answerNow: (v: unknown) => void = () => {}
        rpc.mockReturnValue(new Promise((res) => { answerNow = res }))
        mount()
        expect(await screen.findByText('Comparing your records…')).toBeTruthy()
        answerNow(answer) // held open only as long as the check needs
        expect(await screen.findByText('100%')).toBeTruthy()
    })

    it('says when the records could not be compared, and compares them when asked again', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } })
        mount()
        expect(await screen.findByText('Your records could not be compared just now.')).toBeTruthy()
        expect(screen.queryByText('100%')).toBeNull()
        rpc.mockResolvedValueOnce(answer)
        fireEvent.click(screen.getByText('TRY AGAIN'))
        expect(await screen.findByText('100%')).toBeTruthy()
    })

    it('draws nothing for a record the viewer may not read', async () => {
        rpc.mockResolvedValue({ data: { error: 'forbidden' }, error: null })
        const { container } = mount()
        await waitFor(() => expect(rpc).toHaveBeenCalled())
        await waitFor(() => expect(container.textContent).toBe(''))
    })
})
