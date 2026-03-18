import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // ── Local dev proxy — routes /api/tmdb to TMDB directly for `npm run dev` ──
  // In production, Vercel handles /api routes as serverless functions.
  server: {
    proxy: {
      '/api/tmdb': {
        target: 'https://api.themoviedb.org/3',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path)
          const tmdbPath = url.searchParams.get('path') || ''
          const separator = tmdbPath.includes('?') ? '&' : '?'
          return `${tmdbPath}${separator}api_key=${process.env.VITE_TMDB_API_KEY || ''}`
        },
      },
    },
  },

  // ── Vitest unit test config ──
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-data': ['@tanstack/react-query', 'zustand'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    target: 'esnext',
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      '@tanstack/react-query',
      'zustand',
      'lucide-react',
    ],
  },
})
