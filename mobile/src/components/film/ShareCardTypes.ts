export interface ShareCardData {
    filmTitle: string;
    filmYear?: string;
    year?: string;
    posterPath?: string | null;
    posterUri?: string;
    backdropUri?: string;
    rating: number;
    review?: string;
    username: string;
    status?: 'watched' | 'rewatched' | 'abandoned';
    abandonedReason?: string | null;
    role?: string;
    watchedWith?: string;
    pullQuote?: string;
    dropCap?: boolean;
}

export interface LayoutProps {
    data: ShareCardData;
    posterUrl: string | null;
    yearDisplay: string;
    rawReview: string;
    statusLabel: string;
    cardWidth: number;
}
