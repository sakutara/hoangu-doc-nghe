import { useState } from 'react';
import { InteractiveChineseText } from '../components/InteractiveChineseText';

const SAMPLES = ['请先注册账号', '我是来打酱油的', '看到这个剧情我直接破防了', '他开挂满级，氪金还拉黑了粉丝'];

export function SentenceAnalyzerPage() {
  const [text, setText] = useState(SAMPLES[0]);
  return (
    <section className="grid gap-[var(--gap)] xl:grid-cols-2 xl:items-start">
      <h2 className="page-title xl:col-span-2">Phân tích câu & Tra từ chạm</h2>
      <div className="min-w-0 space-y-3">
      <textarea
        aria-label="Nhập câu tiếng Hoa"
        className="input !py-3 !text-xl"
        lang="zh-CN"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mx-[calc(var(--gutter)*-1)] flex gap-2 overflow-x-auto overscroll-x-contain px-[var(--gutter)] pb-1 md:mx-0 md:flex-wrap md:px-0">
        {SAMPLES.map((s) => (
          <button key={s} className="pill shrink-0" onClick={() => setText(s)}>{s}</button>
        ))}
      </div>
      </div>
      <div className="card"><InteractiveChineseText text={text} /></div>
    </section>
  );
}
