/**
 * LogShareCard — a log, as THE NITRATE FILE draws it.
 *
 * The card template itself lives in NitrateFileCard (shared with the film
 * page) so a member's file looks identical from every room. The log page
 * mounts this inside its own hidden capture, only while a share is in flight.
 */
import { tmdb } from '@/src/lib/tmdb';
import { NitrateFileCard } from '@/src/components/film/NitrateFileCard';

export interface ShareCardData {
    filmTitle: string;
    filmYear?: string;
    year?: string;
    posterPath?: string | null;
    posterUri?: string;
    rating: number;
    review?: string;
    username: string;
    status?: 'watched' | 'rewatched' | 'abandoned';
    pullQuote?: string;
    memberNo?: number | null;
}

export default function LogShareCard({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterPath ? tmdb.poster(data.posterPath, 'w500') : (data.posterUri || null);
    return (
        <NitrateFileCard
            data={{
                title: data.filmTitle,
                year: data.filmYear || data.year || '',
                posterUrl,
                rating: data.rating,
                review: data.review,
                pullQuote: data.pullQuote,
                status: data.status ?? null,
                username: data.username,
                memberNo: data.memberNo,
            }}
        />
    );
}
