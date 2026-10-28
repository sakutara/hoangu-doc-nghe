import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'extension', 'scripts', '.agents'];
const SOURCE = /\.(ts|tsx|js|mjs|py)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : SOURCE.test(name) ? [path] : [];
  });
}

describe('OPF namespace', () => {
  // Calibre chỉ nhận namespace OPF 2005; 2007 làm spine rỗng → "Book is empty, no content in spine".
  it('không file nguồn nào khai báo namespace OPF 2007', () => {
    const bad = ROOTS.flatMap(walk).filter((f) => readFileSync(f, 'utf8').includes('idpf.org/2007/opf'));
    expect(bad).toEqual([]);
  });
});
