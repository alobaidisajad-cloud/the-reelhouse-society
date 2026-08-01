/// <reference types="vite/client" />

// Anything declared here is a CLIENT-SIDE value. Vite inlines every `VITE_*`
// variable a component references directly into the shipped bundle, so a secret
// listed here is a secret published on the internet.
//
// VITE_TMDB_API_KEY was removed deliberately — the TMDB key now lives only in the
// tmdb-proxy edge function's server-side secret. Do not add it back. If a file needs
// TMDB data, call the proxy (see the note at the top of src/tmdb.ts).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Recovery mode flag — used to suppress auto-login during password reset
interface Window {
  __reelhouseRecoveryMode?: boolean
}
