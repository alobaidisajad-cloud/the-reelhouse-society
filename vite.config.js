import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Don't precache index.html — always fetch fresh from network
        navigateFallback: null,
        // Purge old caches on activate
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'gold-reel.svg'],
      manifest: {
        name: 'The ReelHouse Society',
        short_name: 'ReelHouse',
        description: 'A members-only cinema society.',
        theme_color: '#8B6914',
        background_color: '#0A0703',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],


  // ── Vitest unit test config ──
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', '.gemini', 'dist'],
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
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-sentry': ['@sentry/react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    target: 'esnext',
    // Strip console.log/warn from production — keeps dev output clean
    minify: true,
    esbuild: {
      drop: ['console'],
    },
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
