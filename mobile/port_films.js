const fs = require('fs');

let webCode = fs.readFileSync('c:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/src/stores/films.ts', 'utf8');

// Replacements
webCode = webCode.replace(/import \{ persist, createJSONStorage \} from 'zustand\/middleware'\n/, '');
webCode = webCode.replace(/import \{ get, set, del \} from 'idb-keyval'\n/, '');
webCode = webCode.replace(/import \{ supabase \} from '\.\.\/supabaseClient'/, `import { supabase } from '../lib/supabase'`);
webCode = webCode.replace(/import \{ enqueueMutation \} from '\.\.\/utils\/offlineQueue'\n/, '');

// Remove Undo logic globals
webCode = webCode.replace(/\/\/ ── Undo Queue[\s\S]*?(?=\/\*\*\s*Lightweight)/, '');

// Strip persist middleware
// Replace `export const useFilmStore = create<FilmState>()(\n    persist(\n        (set, get) => ({`
// With `export const useFilmStore = create<FilmState>()((set, get) => ({`
webCode = webCode.replace(/export const useFilmStore = create<FilmState>\(\)\(\s*persist\(\s*\(\s*set,\s*get\s*\)\s*=>\s*\(\{/g, 'export const useFilmStore = create<FilmState>()((set, get) => ({');

// Remove persist config at the bottom
// Needs to match `        }),\n        {\n            name: 'reelhouse-films',[\s\S]*?}\n    )\n)`
webCode = webCode.replace(/\}\),\s*\{\s*name:\s*'reelhouse-films'[\s\S]*?\}\s*\)\n\)/g, '}))');

// Clean up enqueueMutation
webCode = webCode.replace(/if \(!exists\) \{\s*enqueueMutation\(\{ type: 'endorse_log'[\s\S]*?\}\)\.catch\(\(\) => \{\}\)\s*\}/g, '');
webCode = webCode.replace(/if \(!exists\) \{\s*enqueueMutation\(\{ type: 'endorse_list'[\s\S]*?\}\)\.catch\(\(\) => \{\}\)\s*\}/g, '');

// Clean up scheduleDeletion wrappers
// For removeLog:
webCode = webCode.replace(/const toastId = `undo-\$\{id\}`[\s\S]*?scheduleDeletion\(`log-\$\{id\}`,\s*async\s*\(\)\s*=>\s*\{\s*(.*?)\s*\}\)/g, '$1; reelToast(`"${logToRemove.title}" removed.`, { duration: 3000 })');

// For removeFromWatchlist:
webCode = webCode.replace(/const toastId = `undo-wl-\$\{filmId\}`[\s\S]*?scheduleDeletion\(`wl-\$\{filmId\}`,\s*async\s*\(\)\s*=>\s*\{\s*(.*?)\s*\}\)/g, '$1; reelToast(`"${itemToRemove?.title || \'Film\'}" removed from watchlist.`, { duration: 3000 })');

fs.writeFileSync('c:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/mobile/src/stores/films.ts', webCode);
console.log('Mobile films.ts ported!');
