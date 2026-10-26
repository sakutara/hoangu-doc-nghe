import { BookOpen, GraduationCap, Layers, NotebookPen, Search, TrendingUp } from 'lucide-react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DailyStudyHeader } from './components/DailyStudyHeader';
import { BookLibraryPage } from './pages/BookLibraryPage';
import { LessonPage } from './pages/LessonPage';
import { LessonsPage } from './pages/LessonsPage';
import { ProgressPage } from './pages/ProgressPage';
import { ReaderPage } from './pages/ReaderPage';
import { ReviewPage } from './pages/ReviewPage';
import { SentenceAnalyzerPage } from './pages/SentenceAnalyzerPage';
import { VocabularyAndHabitPage } from './pages/VocabularyAndHabitPage';
import { useOnline } from './useOnline';

const TABS = [
  ['/analyzer', 'Tra từ', Search],
  ['/lessons', 'Giáo trình', GraduationCap],
  ['/library', 'Tủ truyện', BookOpen],
  ['/vocab', 'Sổ từ & 30p', NotebookPen],
  ['/review', 'Ôn từ', Layers],
  ['/progress', 'Tiến độ', TrendingUp],
] as const;

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const online = useOnline();
  // Màn đọc truyện: bỏ thanh bên + tab dưới để nội dung chiếm trọn màn hình.
  const reading = useLocation().pathname.startsWith('/reader/');
  return (
      <div className={`min-h-dvh ${reading ? '' : 'md:grid md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]'}`}>
        <aside className={`sticky top-0 z-20 border-b border-line bg-surface/85 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r md:p-5 ${reading ? 'hidden' : ''}`}>
          <div className="flex min-w-0 items-center justify-between gap-3 md:flex-col md:items-start md:gap-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" lang="zh-CN" className="grid size-9 place-items-center rounded-xl bg-brand text-lg font-bold text-on-brand">华</span>
              <h1 className="min-w-0 text-[length:clamp(0.875rem,3.6vw,1.125rem)] font-bold leading-tight text-brand-strong">HoaNgữ 华语 Đọc-Nghe</h1>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <span aria-hidden="true" className={`size-2 rounded-full ${online ? 'bg-ok' : 'bg-gold-ink'}`} />
              <span>{online ? 'Online' : 'Offline sẵn sàng'} · 简体</span>
            </span>
          </div>
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:mt-6 md:flex-col md:gap-1 md:border-t-0 md:bg-transparent md:pb-0 md:backdrop-blur-none">
            {TABS.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[length:clamp(9px,2.7vw,11px)] font-medium leading-tight transition md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm ${isActive ? 'text-brand md:bg-brand-soft' : 'text-muted hover:text-ink md:hover:bg-surface-2'}`
                }
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className={reading
          ? 'min-w-0 px-[clamp(0.75rem,2.5vw,3rem)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]'
          : 'min-w-0 px-[var(--gutter)] pb-[calc(var(--tabbar-h)+1.5rem+env(safe-area-inset-bottom))] pt-[clamp(1rem,2.5vw,2.5rem)] md:pb-[clamp(1rem,2.5vw,2.5rem)]'}>
          <div key={reading ? 'reader' : 'app'} className={`page-enter mx-auto w-full space-y-[var(--gap)] ${reading ? '' : 'max-w-[120rem]'}`}>
          <DailyStudyHeader />
          <Routes>
            <Route path="/analyzer" element={<SentenceAnalyzerPage />} />
            <Route path="/lessons" element={<LessonsPage />} />
            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/library" element={<BookLibraryPage />} />
            <Route path="/reader/:bookId/:chapter?" element={<ReaderPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/vocab" element={<VocabularyAndHabitPage />} />
            <Route path="*" element={<Navigate to="/analyzer" replace />} />
          </Routes>
          </div>
        </main>
      </div>
  );
}
