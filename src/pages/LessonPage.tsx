import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, Volume2 } from 'lucide-react';
import { InteractiveChineseText } from '../components/InteractiveChineseText';
import { QuizRunner } from '../components/QuizRunner';
import { LESSONS } from '../data/curriculum';
import { isLessonUnlocked, nextLesson, recordAttempt } from '../domains/curriculum/CurriculumProgress';
import { generateQuiz, updateSeen } from '../domains/curriculum/QuizEngine';
import { useServices } from '../services/ServicesContext';
import { speakChinese } from '../services/SpeechService';

type Tab = 'vocab' | 'reading' | 'quiz';

export function LessonPage() {
  const { id = '' } = useParams();
  const { storage } = useServices();
  const lesson = LESSONS.find((l) => l.id === id);
  const [tab, setTab] = useState<Tab>('vocab');
  const [showVi, setShowVi] = useState(false);
  const [showPinyin, setShowPinyin] = useState(true);
  const [round, setRound] = useState(0);
  // Mỗi lần làm bài (round) lấy bộ câu ngẫu nhiên mới, ưu tiên mục chưa ra ở các lần trước.
  const questions = useMemo(() => {
    if (!lesson) return [];
    const qs = generateQuiz(lesson, LESSONS, Math.random, storage.getQuizSeen(lesson.id));
    storage.saveQuizSeen(lesson.id, updateSeen(lesson, storage.getQuizSeen(lesson.id), qs));
    return qs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, round]);

  if (!lesson || !isLessonUnlocked(LESSONS, storage.getLessonProgress(), lesson.id)) {
    return <Navigate to="/lessons" replace />;
  }
  const next = nextLesson(LESSONS, lesson.id);

  return (
    <article className="space-y-[var(--gap)]">
      <Link to="/lessons" className="inline-flex min-h-10 items-center text-sm font-medium">← Giáo trình</Link>
      <h2 className="page-title">{lesson.title}</h2>
      <div className="flex gap-2 overflow-x-auto">
        {([['vocab', 'Từ vựng'], ['reading', 'Đọc & Nghe'], ['quiz', 'Kiểm tra']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`pill shrink-0 ${tab === t ? 'pill-active' : ''}`}>{label}</button>
        ))}
      </div>

      {tab === 'vocab' && (
        <div className="space-y-[var(--gap)]">
          <button className="btn" aria-pressed={showPinyin} onClick={() => setShowPinyin((s) => !s)}>
            {showPinyin ? <EyeOff size={16} /> : <Eye size={16} />} {showPinyin ? 'Ẩn pinyin' : 'Hiện pinyin'}
          </button>
          <ul className="fluid-grid-sm">
            {lesson.vocab.map((v) => (
              <li key={v.simplified} className="card flex items-center justify-between gap-3">
                <div>
                  <b className="text-3xl" lang="zh-CN">{v.simplified}</b>{v.traditional && <span className="ml-1 text-xs text-muted">({v.traditional})</span>}
                  {showPinyin && <div className="font-medium text-brand">{v.pinyin}</div>}
                  <div><span className="capitalize">{v.hanViet}</span> — {v.meaning}</div>
                </div>
                <button className="btn-icon shrink-0" aria-label={`Nghe ${v.simplified}`} onClick={() => speakChinese(v.simplified)}><Volume2 size={20} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'reading' && (
        <div className="space-y-[var(--gap)]">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={showVi} onChange={(e) => setShowVi(e.target.checked)} /> Hiện bản dịch tiếng Việt
          </label>
          <div className="fluid-grid">
          {lesson.lines.map((l) => (
            <div key={l.zh} className="card">
              <InteractiveChineseText text={l.zh} />
              <div className="text-sm font-medium text-brand">{l.pinyin}</div>
              {showVi && <div className="mt-1 text-sm text-muted">{l.vi}</div>}
              <button className="btn mt-2 !min-h-10" onClick={() => speakChinese(l.zh)}><Volume2 size={14} /> Nghe câu</button>
            </div>
          ))}
          </div>
        </div>
      )}

      {tab === 'quiz' && (
        <QuizRunner
          key={round}
          questions={questions}
          onRetry={() => setRound((r) => r + 1)}
          onFinish={(r) => storage.saveLessonProgress(recordAttempt(storage.getLessonProgress(), lesson.id, r.percent))}
          renderNext={() => next && <Link className="btn btn-primary no-underline" to={`/lesson/${next.id}`} onClick={() => { setTab('vocab'); }}>Bài kế tiếp →</Link>}
        />
      )}
    </article>
  );
}
