// ============================================================
// Social/content domain types — extracted from monolithic types.ts
// ============================================================

export interface Interaction {
    type: 'endorse' | 'endorse_list'
    targetId: string
    timestamp: string
}

export interface Notification {
    id: string
    type: 'endorse' | 'follow' | 'annotate' | 'retransmit' | 'system' | 'reaction'
    message?: string
    from?: string
    from_user?: string
    from_avatar?: string
    target_id?: string
    read: boolean
    created_at?: string
    timestamp: string
}

export interface LoungeMember {
    user_id: string
    username: string
    avatar_url?: string
}

/**
 * @deprecated Use `DossierDetail` from '@/src/schemas/dossier.schema.ts' for API boundaries.
 * T3-7: This legacy interface has a different shape from the Zod-validated version.
 * It exists for backward compatibility with older UI components.
 */
export interface DossierDetail {
    id: string
    title: string
    excerpt?: string
    full_content?: string
    author?: string
    author_username?: string
    user_id?: string
    created_at?: string
    views?: number
    certify_count?: number
}

export interface DossierComment {
    id: string
    user_id: string
    username: string
    body: string
    created_at: string
}

export interface DispatchDossier {
    id: string
    title: string
    content: string
    excerpt?: string
    author_id?: string
    author_name?: string
    author_avatar?: string
    film_id?: number
    film_title?: string
    film_poster?: string | null
    type: 'essay' | 'review' | 'list' | 'letter'
    published: boolean
    endorsements?: number
    created_at?: string
}
