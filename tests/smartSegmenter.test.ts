import { describe, expect, it } from 'vitest';
import { defaultSegmenter as seg } from '../src/domains/dictionary';
import { LESSONS } from '../src/data/curriculum';

describe('SmartSegmenter', () => {
  it('tách từ kép, liên 3, thành ngữ', () => {
    expect(seg.segmentSentence('我是来打酱油的').map((t) => t.text)).toEqual(['我', '是', '来', '打酱油', '的']);
    expect(seg.segmentSentence('莫名其妙').map((t) => t.text)).toEqual(['莫名其妙']);
    expect(seg.segmentSentence('破防了')[0].entry?.category).toBe('slang');
  });
  it('nhận diện lóng, game, từ gốc Anh', () => {
    expect(seg.lookup('氪金')?.category).toBe('gaming');
    expect(seg.lookup('粉丝')?.englishOrigin).toBe('fans');
    expect(seg.lookup('寄存器')?.meanings[0]).toContain('thanh ghi');
  });
  it('chạm giữa cụm vẫn ra cả cụm + chữ thành phần', () => {
    const t = seg.lookupAtPosition('请先注册账号', 3)!;
    expect(t.text).toBe('注册账号');
    expect(t.constituents.map((c) => c.simplified)).toEqual(['注', '册', '账', '号']);
    expect(seg.lookupAtPosition('我是来打酱油的', 4)!.text).toBe('打酱油');
  });
  it('xử lý dấu câu, rỗng, ngoài từ điển', () => {
    expect(seg.segmentSentence('')).toEqual([]);
    const toks = seg.segmentSentence('你，龘！');
    expect(toks[1].isChineseOrAlnum).toBe(false);
    expect(toks[2].entry).toBeUndefined();
    expect(seg.lookupAtPosition('你，', 1)).toBeNull();
    expect(seg.lookupAtPosition('你', 5)).toBeNull();
    expect(seg.lookupAtPosition('龘', 0)!.entry).toBeUndefined();
  });
  it('mục trùng giữ mục có điểm cao hơn', () => {
    const s = new (seg.constructor as any)([
      { simplified: 'x', pinyin: '', hanViet: '', meanings: ['a'], category: 'core' },
      { simplified: 'x', pinyin: '', hanViet: '', meanings: ['b'], category: 'slang' },
      { simplified: 'x', pinyin: '', hanViet: '', meanings: ['c'], category: 'core' },
    ]);
    expect(s.lookup('x').meanings[0]).toBe('b');
  });
  it('mọi từ vựng và câu trong giáo trình đều tra được, cụm đôi được gom đủ', () => {
    for (const l of LESSONS) {
      for (const v of l.vocab) expect(seg.lookup(v.simplified), v.simplified).toBeDefined();
      for (const ln of l.lines) {
        for (const t of seg.segmentSentence(ln.zh)) {
          if (t.isChineseOrAlnum) expect(t.entry, `${t.text} trong ${ln.zh}`).toBeDefined();
        }
      }
    }
    expect(seg.lookupAtPosition('这个视频我点赞了。', 3)!.text).toBe('视频');
    expect(seg.lookupAtPosition('这个视频我点赞了。', 6)!.text).toBe('点赞');
  });
});
