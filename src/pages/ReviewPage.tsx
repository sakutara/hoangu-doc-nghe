import { useEffect, useState } from 'react';
import { dueCards, reviewCard, srsStats, type SrsCard, type SrsGrade } from '../domains/srs/SrsScheduler';
import { toDateStr } from '../domains/tracker/DailyHabitTracker';
import { useServices } from '../services/ServicesContext';
import { speakChinese } from '../services/SpeechService';

type Mode = 'read' | 'listen';
const GRADES: Array<[SrsGrade, string]> = [['again', 'Quên'], ['hard', 'Khó'], ['good', 'Tốt'], ['easy', 'Dễ']];

export function ReviewPage({ now = () => new Date() }: { now?: () => Date }) {
  const { storage } = useServices();
  const today = toDateStr(now());
  const [mode, setMode] = useState<Mode>('read');
  const [queue, setQueue] = useState<string[]>(() => dueCards(storage.syncSrs(today), today).map((c) => c.simplified));
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const words = storage.getSavedWords();

  const head = queue[0];
  const entry = words.find((w) => w.simplified === head);
  useEffect(() => {
    if (head && mode === 'listen') speakChinese(head);
  }, [head, mode]);

  const grade = (g: SrsGrade) => {
    const cards = storage.getSrsCards();
    const card = cards.find((c) => c.simplified === head) as SrsCard;
    storage.saveSrsCards(cards.map((c) => (c.simplified === head ? reviewCard(card, g, today) : c)));
    setReviewed((n) => n + 1);
    setFlipped(false);
    setQueue((q) => (g === 'again' ? [...q.slice(1), head] : q.slice(1)));
  };

  if (!head) {
    const stats = srsStats(storage.getSrsCards(), today);
    return (
      <section className="card space-y-2">
        <h2 className="page-title">Ôn từ vựng</h2>
        {reviewed > 0 ? <p>Hoàn thành phiên ôn: {reviewed} lượt chấm.</p> : <p>Hôm nay không còn từ cần ôn.</p>}
        {stats.nextDue && <p className="text-sm text-muted">Lần ôn gần nhất tiếp theo: {stats.nextDue}</p>}
        {stats.total === 0 && <p className="text-muted">Sổ từ đang trống. Chạm vào chữ khi học và bấm “Lưu từ”.</p>}
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[min(100%,44rem)] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="page-title">Ôn từ vựng</h2>
        <select aria-label="Chế độ ôn" value={mode} onChange={(e) => { setMode(e.target.value as Mode); setFlipped(false); }} className="input !w-auto">
          <option value="read">Đọc</option>
          <option value="listen">Nghe</option>
        </select>
      </div>
      <p className="text-sm text-muted">Còn {queue.length} thẻ</p>
      <div className="card flex min-h-64 flex-col items-center justify-center p-6 text-center">
        {mode === 'read' || flipped
          ? <div lang="zh-CN" className="text-[length:clamp(3.5rem,12vw,7rem)] font-bold leading-tight">{head}</div>
          : <button onClick={() => speakChinese(head)} className="btn">Nghe lại</button>}
        {flipped && entry && (
          <div className="mt-4 space-y-1">
            <div className="text-xl font-medium text-brand">{entry.pinyin}</div>
            <div>{entry.meanings.join('; ')}</div>
            <button onClick={() => speakChinese(head)} className="btn mt-2">Nghe</button>
          </div>
        )}
      </div>
      {flipped ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] grid grid-cols-4 gap-2 md:static">
          {GRADES.map(([g, label]) => (
            <button key={g} onClick={() => grade(g)} className="btn !min-h-12 shadow-card">{label}</button>
          ))}
        </div>
      ) : (
        <button onClick={() => setFlipped(true)} className="btn btn-primary w-full !min-h-12 text-base">Hiện đáp án</button>
      )}
    </section>
  );
}
