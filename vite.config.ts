/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { outDir: 'docs', emptyOutDir: true }, // GitHub Pages phục vụ trực tiếp docs/index.html trên main
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'custom-sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'HoaNgữ Đọc-Nghe',
        short_name: 'HoaNgữ',
        description: 'Học đọc & nghe tiếng Hoa offline',
        theme_color: '#b91c1c',
        background_color: '#fffaf0',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/domains/**', 'src/services/**', 'src/components/**', 'src/pages/**', 'src/App.tsx'],
      exclude: ['src/services/storage/idbBackend.ts', 'src/services/storage/opfsBackend.ts', 'src/services/appServices.ts', 'src/sw/custom-sw.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
