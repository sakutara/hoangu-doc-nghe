import { Link } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { LESSONS, LEVEL_TITLES } from '../data/curriculum';
import { completionPercent, isLessonUnlocked, sortLessons } from '../domains/curriculum/CurriculumProgress';
import { useServices } from '../services/ServicesContext';

export function LessonsPage() {
  const { storage } = useServices();
  const progress = storage.getLessonProgress();
  const sorted = sortLessons(LESSONS);
  const pct = completionPercent(LESSONS, progress);
  const currentLevel = (sorted.find((l) => !progress[l.id]?.completed) ?? sorted[sorted.length - 1]).level;
  const totalWords = LESSONS.reduce((n, l) => n + l.vocab.length, 0);
  return (
    <section className="space-y-[var(--gap)]">
      <h2 className="page-title">Giáo trình & Kiểm tra</h2>
      <div className="card flex items-center gap-3 text-sm font-medium">
        <progress value={pct} max={100} aria-label="Hoàn thành giáo trình" className="flex-1" /> <span className="shrink-0">{pct}% hoàn thành</span>
      </div>
      <p className="text-sm text-muted">{LESSONS.length} bài · khoảng {totalWords.toLocaleString('vi-VN')} từ vựng — hoàn thành toàn bộ để đọc truyện mạng, lướt web, xem phim trơn tru.</p>
      <div className="fluid-grid items-start">
      {[1, 2, 3, 4].map((level) => {
        const items = sorted.filter((l) => l.level === level);
        const done = items.filter((l) => progress[l.id]?.completed).length;
        return (
          <details key={level} open={level === currentLevel} className="card !p-0 overflow-hidden">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-semibold text-brand-strong">
              {LEVEL_TITLES[level]} <span className="ml-2 text-sm font-normal text-muted">· {done}/{items.length} bài</span>
            </summary>
            <ul className="fluid-grid-sm border-t border-line bg-surface-2 p-3">
              {items.map((l) => {
                const unlocked = isLessonUnlocked(LESSONS, progress, l.id);
                const p = progress[l.id];
                return (
                  <li key={l.id} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                    <span className="min-w-0">
                      <span className="mr-2 text-xs text-muted">Bài {l.order}</span>
                      {unlocked ? <Link to={`/lesson/${l.id}`} className="font-medium no-underline hover:underline">{l.title}</Link> : <span className="text-muted">{l.title}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {p && <span>Điểm tốt nhất {p.bestScore}%</span>}
                      {p?.completed ? <Check size={18} className="text-ok" aria-label="Đã hoàn thành" /> : !unlocked && <Lock size={16} aria-label="Đang khóa" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      </div>
    </section>
  );
}
