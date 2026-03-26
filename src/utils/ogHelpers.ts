/**
 * generateOGMeta — Generates Open Graph meta data for dynamic share cards.
 * Returns the meta properties needed for og:title, og:description, og:image.
 * Used by PageSEO to produce share-card-ready pages.
 */

import { tmdb } from '../tmdb'

const SITE_URL = 'https://thereelhousesociety.com'

// Film detail share card
export function filmOG(film: any) {
  if (!film) return {}
  const year = film.release_date?.slice(0, 4) || ''
  const rating = film.vote_average ? `${(film.vote_average / 2).toFixed(1)}/5` : ''
  return {
    title: `${film.title}${year ? ` (${year})` : ''}`,
    description: film.overview?.slice(0, 155) || `Explore ${film.title} on The ReelHouse Society.`,
    ogImage: film.backdrop_path
      ? tmdb.backdrop(film.backdrop_path, 'w1280')
      : film.poster_path
        ? tmdb.poster(film.poster_path, 'w500')
        : `${SITE_URL}/og-card.png`,
    ogType: 'video.movie' as const,
    path: `/film/${film.id}`,
  }
}

// User profile share card
export function profileOG(user: any) {
  if (!user) return {}
  const filmCount = user.logCount || 0
  return {
    title: `@${user.username}`,
    description: user.bio || `${user.username} has logged ${filmCount} films on The ReelHouse Society.`,
    ogImage: user.avatar_url || `${SITE_URL}/og-card.png`,
    ogType: 'profile' as const,
    path: `/user/${user.username}`,
  }
}

// List share card
export function listOG(list: any) {
  if (!list) return {}
  return {
    title: list.title || 'Film Stack',
    description: list.description?.slice(0, 155) || `A curated film collection on The ReelHouse Society.`,
    ogImage: `${SITE_URL}/og-card.png`,
    path: `/lists/${list.id}`,
  }
}

// Person share card
export function personOG(person: any) {
  if (!person) return {}
  return {
    title: person.name || 'Person',
    description: person.biography?.slice(0, 155) || `Explore ${person.name}'s filmography on The ReelHouse Society.`,
    ogImage: person.profile_path
      ? tmdb.profile(person.profile_path, 'w185')
      : `${SITE_URL}/og-card.png`,
    ogType: 'profile' as const,
    path: `/person/${person.id}`,
  }
}
