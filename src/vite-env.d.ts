/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TMDB_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Recovery mode flag — used to suppress auto-login during password reset
interface Window {
  __reelhouseRecoveryMode?: boolean
}
