import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(
  ['../{src,extension,scripts}/**/*.{ts,tsx,js,mjs,py}', '../.agents/**/*.{ts,tsx,js,mjs,py}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('OPF namespace', () => {
  // Calibre chỉ nhận namespace OPF 2005; 2007 làm spine rỗng → "Book is empty, no content in spine".
  it('không file nguồn nào khai báo namespace OPF 2007', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const bad = Object.entries(sources).filter(([, text]) => text.includes('idpf.org/2007/opf')).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
