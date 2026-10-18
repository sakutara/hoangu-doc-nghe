import { useState } from 'react';
import { defaultSegmenter, type SegmentedToken } from '../domains/dictionary';
import { WordLookupPopover } from './WordLookupPopover';

/** Mỗi ký tự là một nút chạm; chạm vào chữ bất kỳ sẽ gom cả cụm từ chứa nó. */
export function InteractiveChineseText({ text, className }: { text: string; className?: string }) {
  const [picked, setPicked] = useState<SegmentedToken | null>(null);
  const tap = (offset: number) => setPicked(defaultSegmenter.lookupAtPosition(text, offset));
  let offset = 0;
  return (
    <div className={className}>
      <p className="hanzi-read" lang="zh-CN">
        {[...text].map((ch) => {
          const i = offset;
          offset += ch.length;
          const active = picked && i >= picked.startIndex && i < picked.endIndex;
          return (
            <span
              key={i}
              role="button"
              tabIndex={0}
              data-index={i}
              onClick={() => tap(i)}
              onKeyDown={(e) => e.key === 'Enter' && tap(i)}
              className={`cursor-pointer rounded-md transition-colors ${active ? 'bg-gold text-gold-ink' : 'hover:bg-brand-soft'}`}
            >
              {ch}
            </span>
          );
        })}
      </p>
      {picked && (
        <div className="fixed inset-x-[var(--gutter)] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-40 max-h-[60dvh] overflow-y-auto rounded-2xl md:static md:mt-3 md:max-h-none md:overflow-visible">
          <WordLookupPopover token={picked} onClose={() => setPicked(null)} />
        </div>
      )}
    </div>
  );
}
