// ============================================================
// UI state & misc domain types — extracted from monolithic types.ts
// ============================================================

export interface UIState {
    logModalOpen: boolean
    signupModalOpen: boolean
    paywallOpen: boolean
    paywallFeature: string
    handbookOpen: boolean
    handbookSection: string | null
}

