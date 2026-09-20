/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy()
  ],
  server: {
    // Bind every interface, not just localhost, so a phone on the same Wi-Fi
    // can open the app and follow the activation and password reset links.
    host: true,
    // Accept requests forwarded through an ngrok tunnel. A leading dot allows
    // every subdomain, since each tunnel gets its own random one.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    port: 8100,
    // Forward API calls to Laravel, so the app and the API share one origin
    // and a single ngrok tunnel on this port serves both. The /api prefix is
    // kept, because Laravel's routes live under it.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
})
