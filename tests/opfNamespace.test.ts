import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(
  ['../{src,extension,scripts}/**/*.{ts,tsx,js,mjs,py}', '../.agents/**/*.{ts,tsx,js,mjs,py}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('OPF namespace', () => {
  // Namespace OPF đúng là http://www.idpf.org/2007/opf. Khai báo 2005 làm Calibre không thấy spine
  // → "Spineless: Book is empty, no content in spine" (đã kiểm chứng bằng calibre.srv.render_book).
  it('không file nguồn nào khai báo namespace OPF 2005', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const bad = Object.entries(sources).filter(([, text]) => text.includes('idpf.org/2005/opf')).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
