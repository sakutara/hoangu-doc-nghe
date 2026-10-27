// Biên dịch Tailwind cho panel của extension: extension/panel.src.css (quét class trong content.js) → extension/panel.css.
// Chạy: npm run build:extension:css (sau khi đổi class trong extension/content.js)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { transform } from 'lightningcss';

const dir = fileURLToPath(new URL('../extension/', import.meta.url));
const src = fileURLToPath(new URL('../extension/panel.src.css', import.meta.url));

const compiler = await compile(readFileSync(src, 'utf8'), { base: dirname(src), onDependency() {} });
const scanner = new Scanner({ sources: [{ base: dir, pattern: 'content.js', negated: false }] });
const css = compiler.build(scanner.scan());
const out = transform({ filename: 'panel.css', code: Buffer.from(css), minify: true, targets: { chrome: 110 << 16 } });
writeFileSync(new URL('../extension/panel.css', import.meta.url), out.code);
console.log(`extension/panel.css (${out.code.length} bytes)`);
