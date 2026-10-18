import { describe, expect, it, vi } from 'vitest';
import { SmartSegmenter } from '../src/domains/dictionary';
import { cedictToEntries, loadCedict, type CedictRow } from '../src/domains/dictionary/cedict';

const rows: CedictRow[] = [
  ['女', '', 'nǚ', 'female / woman'],
  ['女', '', 'rǔ', 'you'],
  ['猫', '貓', 'māo', 'cat'],
  ['女猫', '', 'nǚ māo', 'female cat'],
  ['龘龘', '', 'dá dá', 'rare'],
];
const seed = () => new SmartSegmenter([
  { simplified: '女', pinyin: 'nǚ', hanViet: 'nữ', meanings: ['con gái'], category: 'core' },
  { simplified: '猫', pinyin: 'māo', hanViet: 'miêu', meanings: ['mèo'], category: 'core' },
]);

describe('CC-CEDICT', () => {
  it('gộp mục trùng, ghép Hán-Việt khi đủ chữ, bỏ trống khi thiếu', () => {
    const seg = seed();
    const m = Object.fromEntries(cedictToEntries(rows, seg).map((e) => [e.simplified, e]));
    expect(m['女'].meanings).toEqual(['female / woman', 'rǔ: you']);
    expect(m['女猫'].hanViet).toBe('nữ miêu');
    expect(m['龘龘'].hanViet).toBe('');
    expect(m['猫'].traditional).toBe('貓');
  });
  it('nạp không đè mục biên soạn tay, trả về số mục mới', async () => {
    const seg = seed();
    const ok = vi.fn(async () => ({ ok: true, json: async () => rows }) as Response);
    expect(await loadCedict(seg, 'x', ok as unknown as typeof fetch)).toBe(2);
    expect(seg.lookup('女')!.meanings).toEqual(['con gái']);
    expect(seg.lookup('女猫')!.meanings[0]).toBe('female cat');
    expect(await loadCedict(seg, 'x', ok as unknown as typeof fetch)).toBe(2); // dùng lại promise
    expect(ok).toHaveBeenCalledTimes(1);
  });
  it('lỗi tải không làm hỏng app và cho phép thử lại', async () => {
    vi.resetModules();
    const { loadCedict: load } = await import('../src/domains/dictionary/cedict');
    const bad = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    expect(await load(seed(), 'x', bad as unknown as typeof fetch)).toBe(0);
    const good = vi.fn(async () => ({ ok: true, json: async () => rows }) as Response);
    expect(await load(seed(), 'x', good as unknown as typeof fetch)).toBe(2);
  });
});
