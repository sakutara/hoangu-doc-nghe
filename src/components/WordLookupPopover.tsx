import { useState } from 'react';
import { Bookmark, BookmarkCheck, Volume2, X } from 'lucide-react';
import type { DictionaryEntry, SegmentedToken } from '../domains/dictionary';
import { speakChinese } from '../services/SpeechService';
import { useServices } from '../services/ServicesContext';

const LABELS: Record<DictionaryEntry['category'], string> = {
  core: 'Thông dụng', compound: 'Từ ghép', idiom: 'Thành ngữ', slang: 'Tiếng lóng mạng',
  gaming: 'Game / Truyện', loanword: 'Từ gốc Anh',
};

export function WordLookupPopover({ token, onClose }: { token: SegmentedToken; onClose: () => void }) {
  const { storage } = useServices();
  const entry = token.entry;
  const [saved, setSaved] = useState(() => !!entry && storage.getSavedWords().some((w) => w.simplified === entry.simplified));

  return (
    <div role="dialog" aria-label="Tra từ" className="card !p-5 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div lang="zh-CN" className="text-4xl font-bold">{token.text}</div>
          {entry?.traditional && entry.traditional !== entry.simplified && (
            <div className="text-sm text-muted">Phồn thể: {entry.traditional}</div>
          )}
        </div>
        <button className="btn-icon -mr-2 -mt-2" aria-label="Đóng" onClick={onClose}><X size={20} /></button>
      </div>
      {entry ? (
        <>
          <div className="mt-1 text-lg font-medium text-brand">{entry.pinyin}</div>
          {entry.hanViet && <div className="mt-1 font-medium">Hán-Việt: <span className="capitalize">{entry.hanViet}</span></div>}
          <ul className="mt-2 list-disc space-y-0.5 pl-5">{entry.meanings.map((m) => <li key={m}>{m}</li>)}</ul>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="chip bg-gold text-gold-ink">{LABELS[entry.category]}</span>
            {entry.englishOrigin && (
              <span className="chip bg-info-soft text-info-ink">Gốc Anh: {entry.englishOrigin}</span>
            )}
          </div>
          {token.constituents.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <div className="text-sm font-medium">Chữ thành phần</div>
              <ul className="mt-1 space-y-1 text-sm">
                {token.constituents.map((c, i) => (
                  <li key={`${c.simplified}-${i}`}>
                    <b>{c.simplified}</b> · {c.pinyin}{c.hanViet && <> · <span className="capitalize">{c.hanViet}</span></>} — {c.meanings[0]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn" onClick={() => speakChinese(token.text)}>
              <Volume2 size={16} /> Nghe phát âm
            </button>
            <button
              className={saved ? 'btn btn-primary' : 'btn'}
              onClick={() => setSaved(storage.toggleSaveWord(entry))}
            >
              {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? 'Đã lưu' : 'Lưu từ'}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-muted">Chưa có trong từ điển offline.</p>
      )}
    </div>
  );
}
