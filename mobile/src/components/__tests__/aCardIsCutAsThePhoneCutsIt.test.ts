/**
 * aCardIsCutAsThePhoneCutsIt.test.ts — review round 14 (the house's private.a_card_cut, the phone's cardTitle)
 * ─────────────────────────────────────────────────────────────────────────────
 * A card's title in a salon is written by the house now, from the piece it names (H-A4): a filing's line,
 * a record's film, a film's title. A sender's own cut was once kept when it was a prefix of the line, so a
 * card could read "Nolan's best film…" under "BY @VICTIM" when the filing said "Not even close." Now the
 * house cuts every card's title itself, by the phone's own rule (cardTitle: whole up to 180 code units,
 * else at the last sentence inside them, else at the last whole word), so a card reads the same whether
 * the phone or the house wrote it. The pairs below are the phone's cuts; the house's rehearsal runs the
 * same pairs through private.a_card_cut, line by line, and this test holds both lists to be one.
 */
import { readFileSync } from 'fs';
import { files as universe } from '@/test-utils/universe';
import { cardTitle } from '@/src/components/ShareToLoungeModal';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

/** [the line, as the phone cuts it]: a sentence, an abbreviation, a quote, a word, pictures, accents, one long word. */
const CUTS: [string, string][] = [
  [
    "  Rosebud is the sled.  ",
    "Rosebud is the sled."
  ],
  [
    "The sled was the whole point, and Welles knew it from the first frame. Then the snow globe falls, and the whole picture turns on a word no one in the room ever hears again, which is the joke and the wound at once. After that, nothing.",
    "The sled was the whole point, and Welles knew it from the first frame.…"
  ],
  [
    "I met Mr. Ozu once at a screening in Kamakura where the light came through the paper screens like milk and everyone was very quiet and nobody said a word about the film until the tea had gone cold and the cups were empty and the night outside had fallen",
    "I met Mr. Ozu once at a screening in Kamakura where the light came through the paper screens like milk and everyone was very quiet and nobody said a word about the film until…"
  ],
  [
    "Nolan's best film? not even close, because the third act collapses under its own weight and the score drowns every line that might have saved it, and the ending is a coin toss pretending to be a revelation that it never earned at all or",
    "Nolan's best film? not even close, because the third act collapses under its own weight and the score drowns every line that might have saved it, and the ending is a coin toss…"
  ],
  [
    "She said \"It is finished.\" Then she left the room, and the camera stayed on the empty doorway for a full minute while the rain went on and on outside the window and the clock on the mantel kept time for nobody at all, which is the film.",
    "She said \"It is finished.\"…"
  ],
  [
    "This is No. 17 in the series and it is the one where everything changes for the family because the father finally comes home from the war and nobody recognises him at the station, not even his own daughter who waited every single day for him",
    "This is No. 17 in the series and it is the one where everything changes for the family because the father finally comes home from the war and nobody recognises him at the station…"
  ],
  [
    "🎬🎬🎬 The opening shot holds for three minutes on a face 🎞️ and you feel every second of it 👍🏽 because nothing moves except the eyes, and then the eyes stop moving too and the whole theatre leans in at once to hear what comes next and it is silence",
    "🎬🎬🎬 The opening shot holds for three minutes on a face 🎞️ and you feel every second of it 👍🏽 because nothing moves except the eyes, and then the eyes stop moving too…"
  ],
  [
    "Ça commence à Paris, où la pluie tombe sur les pavés et où personne ne sait encore que le café d'en face va brûler avant l'aube; c'est là que tout se décide, entre deux cigarettes et une lettre jamais envoyée à celle qui attendait",
    "Ça commence à Paris, où la pluie tombe sur les pavés et où personne ne sait encore que le café d'en face va brûler avant l'aube; c'est là que tout se décide, entre deux cigarettes…"
  ],
  [
    "Supercalifragilisticexpialidocious_and_then_some_more_letters_without_any_space_at_all_because_some_people_write_headlines_like_that_on_purpose_to_see_what_happens_when_the_card_runs_out_of_room_entirely_ok",
    "Supercalifragilisticexpialidocious_and_then_some_more_letters_without_any_space_at_all_because_some_people_write_headlines_like_that_on_purpose_to_see_what_happens_when_the_card_ru…"
  ],
  [
    "A film about grief. A film about what grief leaves behind when the house is sold and the furniture is gone and only the marks on the wallpaper show where the pictures hung for forty years. A film about that.",
    "A film about grief.…"
  ],
  [
    "The U.S. version cuts eleven minutes from the middle and the film never recovers from it, because those eleven minutes were the only place the two brothers ever speak to each other as brothers rather than as rivals in a business",
    "The U.S. version cuts eleven minutes from the middle and the film never recovers from it, because those eleven minutes were the only place the two brothers ever speak to each…"
  ],
  [
    "Short and sweet.",
    "Short and sweet."
  ]
];

const unquote = (s: string) => s.split("''").join("'");
/** The pairs the house's rehearsal cuts, read from its lines (pg_temp.ha4_cut('<line>', '<cut>')). */
const houseCuts = (): [string, string][] => {
  const out: [string, string][] = [];
  for (const f of universe('rehearsals')) {
    const sql = readFileSync(f, 'utf8');
    for (const m of sql.matchAll(/pg_temp\.ha4_cut\('((?:[^']|'')*)', '((?:[^']|'')*)'\)/g)) out.push([unquote(m[1]!), unquote(m[2]!)]);
  }
  return out;
};

it('the phone cuts each line as the pairs say: a sentence, else a word, never inside a character', () => {
  expect(MAX_LENGTHS.loungeShareTitle).toBe(180);
  expect(CUTS.map(([line]) => [line, cardTitle(line)])).toEqual(CUTS);
});

it('the house cuts the very same lines the very same way (its rehearsal holds these pairs)', () => {
  const house = houseCuts();
  expect(house.length).toBe(CUTS.length);
  expect([...house].sort()).toEqual([...CUTS].sort());
});

it('a filing\'s line cut by its sharer mid-thought is never what the card says', () => {
  // The review's case: the house writes the filing's own cut, a whole sentence, not "Nolan's best film…".
  const line = CUTS.find(([l]) => l.startsWith("Nolan's best film?"));
  expect(line).toBeDefined();
  expect(cardTitle(line![0])).not.toBe("Nolan's best film…");
});
