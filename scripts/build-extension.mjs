// Đóng gói bộ tra từ của webapp (SmartSegmenter + từ điển lõi + giáo trình + cedictToEntries) thành extension/dict.js
// và sao chép CC-CEDICT vào extension/data/. Chạy: npm run build:extension
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: 'extension',
    emptyOutDir: false,
    minify: true,
    target: 'chrome110',
    lib: { entry: 'scripts/extension-dict-entry.ts', name: 'HNDictLib', formats: ['iife'], fileName: () => 'dict.js' },
  },
});

mkdirSync(new URL('../extension/data/', import.meta.url), { recursive: true });
copyFileSync(new URL('../public/cedict.json', import.meta.url), new URL('../extension/data/cedict.json', import.meta.url));
console.log('extension/dict.js + extension/data/cedict.json đã cập nhật');
