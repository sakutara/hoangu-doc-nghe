import { beforeAll, describe, expect, it } from 'vitest';
import extCedict from '../extension/data/cedict.json?raw';
import dictSource from '../extension/dict.js?raw';
import readerSource from '../extension/reader.js?raw';
import manifest from '../extension/manifest.json';
import appCedict from '../public/cedict.json?raw';
import { LEXICON, SmartSegmenter } from '../src/domains/dictionary';

// dict.js / reader.js là classic script của extension → nạp bằng eval/Function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
// eslint-disable-next-line no-new-func
new Function(`${dictSource}\nglobalThis.HNDictLib = HNDictLib;`)();
// eslint-disable-next-line no-new-func
new Function(readerSource)();
const R = g.HNReader;

describe('extension dict.js (đóng gói từ webapp)', () => {
  it('khớp nguồn: cùng số mục từ điển lõi, cùng kết quả tách từ, cedict.json trùng bản của app', () => {
    expect(g.HNDictLib.LEXICON.length).toBe(LEXICON.length); // lệch = quên chạy `npm run build:extension`
    const ext = new g.HNDictLib.SmartSegmenter(g.HNDictLib.LEXICON);
    const app = new SmartSegmenter(LEXICON);
    const s = '我今天很高兴，他们都来了。';
    expect(ext.segmentSentence(s).map((t: { text: string }) => t.text)).toEqual(app.segmentSentence(s).map((t) => t.text));
    expect(extCedict === appCedict).toBe(true);
  });

  it('manifest: cho content script đọc cedict.json, không xin quyền host rộng', () => {
    expect(manifest.web_accessible_resources[0].resources).toContain("panel.css");
    expect(manifest.web_accessible_resources[0].resources).toContain('data/cedict.json');
    expect((manifest as { host_permissions?: string[] }).host_permissions).toBeUndefined();
  });
});

describe('extension reader.js — chế độ mở popup', () => {
  it('mặc định là Giữ Alt + bấm; setMode chỉ nhận alt/click', () => {
    expect(R.state.mode).toBe('alt');
    R.setMode('click'); expect(R.state.mode).toBe('click');
    R.setMode('bậy'); expect(R.state.mode).toBe('alt');
  });
});

describe('extension reader.js', () => {
  beforeAll(() => { R.useSegmenter(new g.HNDictLib.SmartSegmenter(g.HNDictLib.LEXICON)); });

  const textNodeOf = (el: Element) => el.firstChild as Text;

  it('tra từ tại vị trí chữ trong đoạn: lấy cả cụm, trả range đúng', () => {
    document.body.innerHTML = '<div id="c"><p id="p">他们今天来了，我很高兴。</p></div>';
    const node = textNodeOf(document.getElementById('p')!);
    const idx = (node.nodeValue as string).indexOf('今天');
    const hit = R.lookup(node, idx + 1);
    expect(hit.token.text).toBe('今天');
    expect(hit.token.entry.pinyin).toBeTruthy();
    expect(hit.range.toString()).toBe('今天');
  });

  it('cụm từ nằm vắt qua nhiều thẻ inline vẫn tra được và range phủ cả hai node', () => {
    document.body.innerHTML = '<p id="p">我很<b>高</b>兴，真的。</p>';
    const b = document.querySelector('b')!;
    const hit = R.lookup(b.firstChild, 0);
    expect(hit.token.text).toBe('高兴');
    expect(hit.range.toString()).toBe('高兴');
  });

  it('không phải chữ Hán / node không hợp lệ → null; bỏ qua chữ trong <script>', () => {
    document.body.innerHTML = '<p id="p">abc，他</p>';
    const node = textNodeOf(document.getElementById('p')!);
    expect(R.lookup(node, 0)).toBeNull();
    expect(R.lookup(node, 3)).toBeNull();
    expect(R.lookup(null, 0)).toBeNull();
    document.body.innerHTML = '<p id="q">他<script>var x="龘";</script>们来</p>';
    const q = document.getElementById('q')!;
    expect(R.contextAt(q.firstChild, 0).text).toBe('他们来');
  });

  it('khối rất dài: chỉ lấy cửa sổ quanh vị trí bấm', () => {
    document.body.innerHTML = `<div id="p">${'今天'.repeat(500)}</div>`;
    const node = textNodeOf(document.getElementById('p')!);
    const ctx = R.contextAt(node, 600);
    expect(ctx.text.length).toBeLessThanOrEqual(240);
    expect(ctx.base + ctx.offset).toBe(600);
  });
});
