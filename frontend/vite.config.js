import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

const certFile = '../backend/goon-pod.tail26570e.ts.net.crt'
const keyFile = '../backend/goon-pod.tail26570e.ts.net.key'
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Switched from the default `generateSW` strategy to `injectManifest`:
      // push notifications need a `push`/`notificationclick` listener in the
      // service worker, which generateSW's auto-generated sw.js has no hook
      // for. srcDir/filename point at our own source file below; Workbox
      // precaching + the SPA navigation fallback are wired up by hand inside
      // it (see src/sw.js) since injectManifest doesn't synthesize that part.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
      manifest: {
        name: 'K2',
        short_name: 'K2',
        description: 'Climbing log for friends',
        theme_color: '#863bff',
        background_color: '#0c0a09',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['goon-pod.tail26570e.ts.net'],
    https: hasCerts ? {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    } : undefined,
    proxy: {
      '/api': 'http://localhost:5000',
      '/media': 'http://localhost:5000',
    },
  },
})
