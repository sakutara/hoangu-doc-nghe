import { useState } from 'react';
import { defaultSegmenter, type SegmentedToken } from '../domains/dictionary';
import { WordLookupPopover } from './WordLookupPopover';

/** Mỗi ký tự là một nút chạm; chạm vào chữ bất kỳ sẽ gom cả cụm từ chứa nó. */
export function InteractiveChineseText({ text, className, sheet = false }: { text: string; className?: string; sheet?: boolean }) {
  const [picked, setPicked] = useState<SegmentedToken | null>(null);
  const tap = (offset: number) => setPicked(defaultSegmenter.lookupAtPosition(text, offset));
  let offset = 0;
  return (
    <div className={className}>
      <p className={sheet ? 'hanzi-read hanzi-reader' : 'hanzi-read'} lang="zh-CN">
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
        <div className={`fixed inset-x-[var(--gutter)] z-40 max-h-[60dvh] overflow-y-auto rounded-2xl ${sheet ? 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:w-[26rem] md:max-w-[calc(100vw-3rem)]' : 'bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:static md:mt-3 md:max-h-none md:overflow-visible'}`}>
          <WordLookupPopover token={picked} onClose={() => setPicked(null)} />
        </div>
      )}
    </div>
  );
}
