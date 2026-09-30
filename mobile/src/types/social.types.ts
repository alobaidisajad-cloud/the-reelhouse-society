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

export type LoungeMemberStatus = 'approved' | 'pending' | 'muted' | 'banned'

export interface LoungeMember {
    user_id: string
    username: string
    avatar_url?: string
    /** Membership standing. Absent on legacy rows → treated as 'approved'. */
    status?: LoungeMemberStatus
    /** When the request/membership row was created — used to order "At the Door". */
    created_at?: string
}

export interface DossierComment {
    id: string
    user_id: string
    username: string
    body: string
    created_at: string
}

