import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toDateStr } from '../domains/tracker/DailyHabitTracker';
import { useServices } from '../services/ServicesContext';
import { speakChinese } from '../services/SpeechService';

export function VocabularyAndHabitPage() {
  const { storage } = useServices();
  const [words, setWords] = useState(() => storage.getSavedWords());
  const [settings, setSettings] = useState(() => storage.getHabitSettings());
  const update = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    storage.saveHabitSettings(next);
    setSettings(next);
  };
  const cards = storage.syncSrs(toDateStr(new Date()));
  const askNotify = () => typeof Notification !== 'undefined' && void Notification.requestPermission();

  return (
    <section className="fluid-grid items-start">
      <div className="card">
        <h2 className="page-title">Nhắc học hằng ngày</h2>
        <label className="mt-3 flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={settings.reminderEnabled} onChange={(e) => update({ reminderEnabled: e.target.checked })} />
          Bật nhắc học
        </label>
        <label className="mt-2 flex flex-wrap items-center justify-between gap-2">
          Mục tiêu (phút/ngày)
          <input type="number" min={1} max={240} aria-label="Mục tiêu phút mỗi ngày" value={settings.dailyGoalMinutes}
            onChange={(e) => update({ dailyGoalMinutes: Math.min(240, Math.max(1, Number(e.target.value) || 1)) })} className="input !w-24" />
        </label>
        <label className="mt-2 flex flex-wrap items-center justify-between gap-2">
          Giờ nhắc
          <input type="time" aria-label="Giờ nhắc" value={settings.reminderTime} onChange={(e) => update({ reminderTime: e.target.value })} className="input !w-auto" />
        </label>
        <button className="btn mt-4" onClick={askNotify}>Cho phép thông báo hệ thống</button>
        <p className="mt-3 text-sm text-muted">Chữ viết hiện tại: Giản thể 简体 (Phồn thể 繁體 sẽ có ở bản mở rộng).</p>
      </div>
      <div className="card">
        <h2 className="page-title">Sổ từ vựng ({words.length})</h2>
        {words.length > 0 && <Link to="/review" className="text-sm font-medium underline">Ôn tập ngay</Link>}
        {words.length === 0 && <p className="text-muted">Chưa có từ nào. Chạm vào chữ và bấm “Lưu từ”.</p>}
        <ul className="mt-2 divide-y divide-line">
          {words.map((w) => (
            <li key={w.simplified} className="flex items-center justify-between gap-2 py-2">
              <span><b className="text-2xl" lang="zh-CN">{w.simplified}</b> {w.pinyin} — {w.meanings[0]}
                <small className="ml-2 text-muted">hộp {cards.find((c) => c.simplified === w.simplified)?.box ?? 0}</small></span>
              <span className="flex shrink-0 gap-1">
                <button className="btn !px-3" onClick={() => speakChinese(w.simplified)}>Nghe</button>
                <button className="btn btn-danger !px-3" onClick={() => { storage.toggleSaveWord(w); setWords(storage.getSavedWords()); }}>Xóa</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
