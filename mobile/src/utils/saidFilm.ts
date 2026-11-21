/**
 * saidFilm — a film as a screen reader says it: its title and its year, as the row prints them.
 *
 * Said by its title alone, a film is said alike with every film of its title (three called
 * Nosferatu: 1922, 1979, 2024), though each row prints its year (review round 14). The year is read
 * from whatever the film carries: a year, a TMDB release date, or nothing, when the title stands alone.
 */
export function saidFilm(title: string, when?: string | number | null): string {
  const year = typeof when === 'number' ? (when > 0 ? String(when) : '') : /^\d{4}/.exec(when ?? '')?.[0] ?? '';
  return year ? `${title}, ${year}` : title;
}
