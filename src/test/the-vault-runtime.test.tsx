/**
 * THE VAULT on the web — run, not read.
 * The store, the fields a rewatch sends, the note and its dialog, with the
 * network mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockFetch = vi.fn()
const mockSet = vi.fn()
const mockRemove = vi.fn()
vi.mock('../services/vault', async () => {
    const real = await vi.importActual<typeof import('../services/vault')>('../services/vault')
    return {
        ...real,
        fetchNotesForLog: (...a: unknown[]) => mockFetch(...a),
        setNote: (...a: unknown[]) => mockSet(...a),
        removeNote: (...a: unknown[]) => mockRemove(...a),
    }
})
const mockEnqueue = vi.fn()
vi.mock('../utils/offlineQueue', () => ({
    enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
    clearOfflineQueue: vi.fn(),
    flushOfflineQueue: vi.fn(),
}))

import { useVaultStore } from '../stores/vault'
import { useAuthStore } from '../stores/auth'
import { viewingFieldsFromLog } from '../features/film/hooks/useFilmMutations'
import VaultNote from '../components/vault/VaultNote'
import NoteDialog from '../components/vault/NoteDialog'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const LOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const V1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
const V2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'
const V9 = 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9'

const signIn = (id: string | null) => useAuthStore.setState({ user: id ? ({ id, username: id.slice(0, 4) } as never) : null } as never)
const offline = () => new TypeError('Failed to fetch')

beforeEach(() => {
    vi.clearAllMocks()
    useVaultStore.getState().clear()
    signIn(ALICE)
})

describe('the Vault store', () => {
    it('holds each note by the viewing it belongs to', async () => {
        mockFetch.mockResolvedValueOnce([
            { viewing_id: V1, log_id: LOG_A, notes: 'the first night' },
            { viewing_id: V2, log_id: LOG_A, notes: 'the second night' },
        ])
        await useVaultStore.getState().loadForLog(LOG_A)
        const s = useVaultStore.getState()
        expect(s.notes[V1]).toBe('the first night')
        expect(s.notes[V2]).toBe('the second night')
        expect(s.loaded[LOG_A]).toBe(true)
    })

    it('a note removed on another device does not live on here, and other logs are untouched', async () => {
        mockFetch.mockResolvedValueOnce([{ viewing_id: V9, log_id: LOG_B, notes: 'another film' }])
        await useVaultStore.getState().loadForLog(LOG_B)
        mockFetch.mockResolvedValueOnce([{ viewing_id: V1, log_id: LOG_A, notes: 'kept' }, { viewing_id: V2, log_id: LOG_A, notes: 'gone later' }])
        await useVaultStore.getState().loadForLog(LOG_A)
        mockFetch.mockResolvedValueOnce([{ viewing_id: V1, log_id: LOG_A, notes: 'kept' }])
        await useVaultStore.getState().loadForLog(LOG_A, { force: true })
        const s = useVaultStore.getState()
        expect(s.notes[V2]).toBeUndefined()
        expect(s.notes[V1]).toBe('kept')
        expect(s.notes[V9]).toBe('another film')
    })

    it('an unreachable Vault is said, not mistaken for an empty one', async () => {
        mockFetch.mockRejectedValueOnce(offline())
        await useVaultStore.getState().loadForLog(LOG_A)
        expect(useVaultStore.getState().loaded[LOG_A]).toBeUndefined()
        expect(useVaultStore.getState().unreachable[LOG_A]).toBe(true)
    })

    it('writes NOTHING when the answer arrives for a member who has left', async () => {
        let release: (rows: unknown[]) => void = () => {}
        mockFetch.mockReturnValueOnce(new Promise(r => { release = r as never }))
        const pending = useVaultStore.getState().loadForLog(LOG_A)
        signIn(BOB)
        release([{ viewing_id: V1, log_id: LOG_A, notes: 'Alice’s private writing' }])
        await pending
        expect(useVaultStore.getState().notes[V1]).toBeUndefined()
        expect(useVaultStore.getState().loaded[LOG_A]).toBeUndefined()
    })

    it('with no signal, a note is queued by name — never lost, never blank', async () => {
        mockSet.mockRejectedValueOnce(offline())
        const res = await useVaultStore.getState().saveNote(LOG_A, V1, '  written on a train  ')
        expect(res.queuedOffline).toBe(true)
        expect(mockEnqueue).toHaveBeenCalledWith({ type: 'set_viewing_note', payload: { log_id: LOG_A, viewing_id: V1, notes: 'written on a train' } })
        expect(useVaultStore.getState().notes[V1]).toBe('written on a train')
    })

    it('clearing with no signal queues a REMOVE, not an empty write', async () => {
        mockSet.mockRejectedValueOnce(offline())
        await useVaultStore.getState().saveNote(LOG_A, V1, '   ')
        expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_viewing_note', payload: { viewing_id: V1 } })
    })

    it('a refused note is put back exactly as it was', async () => {
        mockFetch.mockResolvedValueOnce([{ viewing_id: V1, log_id: LOG_A, notes: 'what was there' }])
        await useVaultStore.getState().loadForLog(LOG_A)
        mockSet.mockRejectedValueOnce({ message: 'The Vault is an Archivist feature' })
        await expect(useVaultStore.getState().saveNote(LOG_A, V1, 'a lapsed edit')).rejects.toBeTruthy()
        expect(useVaultStore.getState().notes[V1]).toBe('what was there')
        expect(mockEnqueue).not.toHaveBeenCalled()
    })

    it('removing works offline too, and a real failure puts the note back', async () => {
        mockFetch.mockResolvedValue([{ viewing_id: V1, log_id: LOG_A, notes: 'still mine' }])
        await useVaultStore.getState().loadForLog(LOG_A)
        mockRemove.mockRejectedValueOnce(offline())
        expect((await useVaultStore.getState().dropNote(LOG_A, V1)).queuedOffline).toBe(true)
        expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_viewing_note', payload: { viewing_id: V1 } })

        await useVaultStore.getState().loadForLog(LOG_A, { force: true })
        mockRemove.mockRejectedValueOnce({ message: 'no' })
        await expect(useVaultStore.getState().dropNote(LOG_A, V1)).rejects.toBeTruthy()
        expect(useVaultStore.getState().notes[V1]).toBe('still mine')
    })
})

describe('what a rewatch sends', () => {
    it('only the fields the form provided — the rest are left as they were', () => {
        const f = viewingFieldsFromLog({ rating: 4, review: 'again' })
        expect(f).toEqual({ rating: 4, review: 'again' })
    })

    it('never a note, a history or a count — those are not the client’s to send', () => {
        const f = viewingFieldsFromLog({ rating: 4, privateNotes: 'mine', viewCount: 9, viewingHistory: [] } as never)
        expect(Object.keys(f).sort()).toEqual(['rating'])
    })

    it('“with nobody” is nothing, and the format follows the medium', () => {
        const f = viewingFieldsFromLog({ watchedWith: '', physicalMedia: 'Blu-Ray' })
        expect(f.watched_with).toBeNull()
        expect(f.format).toBe('Blu-Ray')
        expect(viewingFieldsFromLog({ physicalMedia: '' }).format).toBe('Digital')
    })
})

describe('the note, as a member reads it', () => {
    it('says whose it is, and whose only', () => {
        render(<VaultNote note="I cried at the top" />)
        expect(screen.getByText('THE VAULT')).toBeInTheDocument()
        expect(screen.getByText(/ONLY YOU/)).toBeInTheDocument()
        expect(screen.getByText('I cried at the top')).toBeInTheDocument()
    })

    it('an empty note draws nothing at all', () => {
        const { container } = render(<VaultNote note="   " />)
        expect(container.innerHTML).toBe('')
    })

    it('a note that opens is announced as private, then read', () => {
        render(<VaultNote note="I cried at the top" onOpen={() => {}} />)
        expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Your private note. I cried at the top')
    })

    it('reads right-to-left by its own first letter', () => {
        render(<VaultNote note="بكيت في البداية" />)
        expect(screen.getByText('بكيت في البداية').getAttribute('dir')).toBe('auto')
    })
})

describe('the note, opened', () => {
    const dialog = (canEdit: boolean) => {
        const onEdit = vi.fn(), onRemove = vi.fn()
        render(<NoteDialog open note="about that night" viewingLabel="VIEWING 2" canEdit={canEdit} onClose={vi.fn()} onEdit={onEdit} onRemove={onRemove} />)
        return { onEdit, onRemove }
    }

    it('offers EDIT only where editing is real', () => {
        dialog(false)
        expect(screen.queryByLabelText('Edit this note')).toBeNull()
    })

    it('REMOVE asks first, in the house’s own words — and KEEP keeps it', () => {
        const { onRemove } = dialog(true)
        expect(screen.getByLabelText('Edit this note')).toBeInTheDocument()
        fireEvent.click(screen.getByLabelText('Remove this note'))
        expect(screen.getByText('Remove this note?')).toBeInTheDocument()
        expect(screen.getByText('The viewing stays. The note is gone for good.')).toBeInTheDocument()
        fireEvent.click(screen.getByText('KEEP'))
        expect(onRemove).not.toHaveBeenCalled()
        expect(screen.getByLabelText('Remove this note')).toBeInTheDocument()
    })

    it('REMOVE, confirmed, removes', () => {
        const { onRemove } = dialog(false)
        fireEvent.click(screen.getByLabelText('Remove this note'))
        fireEvent.click(screen.getByText('REMOVE'))
        expect(onRemove).toHaveBeenCalledTimes(1)
    })
})
