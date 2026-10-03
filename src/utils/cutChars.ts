/**
 * The first `n` characters of a text, cut between characters. `.slice` cuts
 * UTF-16 units, so it can split an emoji into half a pair, which Postgres
 * refuses — and with it the whole write the text rides in.
 */
export const cutChars = (text: string, n: number): string => Array.from(text).slice(0, n).join('')
