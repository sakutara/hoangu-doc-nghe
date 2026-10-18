import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LESSONS, LEVEL_TITLES } from '../data/curriculum';
import { completionPercent, sortLessons } from '../domains/curriculum/CurriculumProgress';
import { srsStats } from '../domains/srs/SrsScheduler';
import { calculateStreak, toDateStr } from '../domains/tracker/DailyHabitTracker';
import { lastNDays, summarizeStudy } from '../domains/tracker/ProgressAnalytics';
import { useServices } from '../services/ServicesContext';

const fmtMinutes = (sec: number) => `${Math.floor(sec / 60)} phút`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-brand">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function ProgressPage({ now = () => new Date() }: { now?: () => Date }) {
  const { storage } = useServices();
  const [range, setRange] = useState<7 | 30>(7);
  const today = toDateStr(now());
  const records = storage.getStudyRecords();
  const goal = storage.getHabitSettings().dailyGoalMinutes;
  const summary = summarizeStudy(records, goal);
  const days = lastNDays(records, today, range, goal);
  const maxSec = Math.max(goal * 60, ...days.map((d) => d.seconds));
  const progress = storage.getLessonProgress();
  const stats = srsStats(storage.syncSrs(today), today);

  return (
    <section className="grid gap-[var(--gap)] xl:grid-cols-2 xl:items-start">
      <h2 className="page-title xl:col-span-2">Tiến độ học tập</h2>
      <div className="fluid-grid-sm xl:col-span-2">
        <Stat label="Chuỗi hiện tại (ngày)" value={calculateStreak(records, today)} />
        <Stat label="Chuỗi dài nhất (ngày)" value={summary.longestStreak} />
        <Stat label="Tổng thời gian" value={fmtMinutes(summary.totalSeconds)} />
        <Stat label="Ngày đạt mục tiêu" value={summary.goalDays} />
      </div>

      <div className="card xl:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Thời gian học theo ngày</h3>
          <select aria-label="Khoảng thời gian" value={range} onChange={(e) => setRange(Number(e.target.value) as 7 | 30)} className="input !w-auto">
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
          </select>
        </div>
        <div role="img" aria-label={`Biểu đồ ${range} ngày`} className="mt-3 flex h-[clamp(10rem,22vh,18rem)] items-end gap-1">
          {days.map((d) => (
            <div key={d.date} title={`${d.date}: ${fmtMinutes(d.seconds)}`} data-testid="day-bar" data-goal={d.goalCompleted}
              className={`flex-1 rounded-t ${d.goalCompleted ? 'bg-ok' : 'bg-brand/50'}`}
              style={{ height: `${Math.max(2, (d.seconds / maxSec) * 100)}%` }} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Cột xanh: đạt mục tiêu {goal} phút/ngày.</p>
      </div>

      <div className="card">
        <h3 className="font-semibold">Giáo trình: {completionPercent(LESSONS, progress)}% hoàn thành</h3>
        {[1, 2, 3, 4].map((level) => {
          const items = sortLessons(LESSONS).filter((l) => l.level === level);
          const done = items.filter((l) => progress[l.id]?.completed).length;
          return (
            <details key={level} className="mt-2 rounded-xl bg-surface-2 px-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-strong">{LEVEL_TITLES[level]} · {done}/{items.length} bài</summary>
              <ul className="text-sm">
                {items.map((l) => (
                  <li key={l.id} className="flex justify-between border-t border-line py-2">
                    <span>{l.title}</span>
                    <span>{progress[l.id] ? `${progress[l.id].bestScore}%${progress[l.id].completed ? ' ✔' : ''}` : '—'}</span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>

      <div className="card">
        <h3 className="font-semibold">Sổ từ vựng</h3>
        <p className="text-sm" data-testid="srs-summary">
          {stats.total} từ · {stats.due} cần ôn hôm nay · {stats.mastered} đã thuộc
        </p>
        <Link to="/review" className="btn btn-primary mt-3 no-underline">Ôn từ vựng ngay</Link>
      </div>
    </section>
  );
}
