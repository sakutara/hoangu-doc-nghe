import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Flame, Pause, Play, Plus } from 'lucide-react';
import { calculateStreak, recordStudySeconds, toDateStr } from '../domains/tracker/DailyHabitTracker';
import { isReminderVisible, showSystemNotification, snoozeUntil } from '../domains/tracker/ReminderService';
import { useServices } from '../services/ServicesContext';

export function DailyStudyHeader({ now = () => new Date() }: { now?: () => Date }) {
  const { storage } = useServices();
  const [records, setRecords] = useState(() => storage.getStudyRecords());
  const [running, setRunning] = useState(true);
  const [reminderState, setReminderState] = useState(() => storage.getReminderState());
  const [open, setOpen] = useState(() => localStorage.getItem('studyBarOpen') === '1');
  const toggle = () => setOpen((o) => { localStorage.setItem('studyBarOpen', o ? '0' : '1'); return !o; });
  const settings = storage.getHabitSettings();
  const ref = useRef(records);
  ref.current = records;

  const add = (sec: number) => {
    const next = recordStudySeconds(ref.current, toDateStr(now()), sec, settings.dailyGoalMinutes);
    ref.current = next;
    storage.saveStudyRecords(next);
    setRecords(next);
  };

  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => addRef.current(1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const today = toDateStr(now());
  const rec = records.find((r) => r.date === today);
  const secs = rec?.secondsStudied ?? 0;
  const goal = settings.dailyGoalMinutes * 60;
  const hhmm = now().toTimeString().slice(0, 5);
  const remind = isReminderVisible(rec, settings, hhmm, reminderState, today);
  const hold = (state: { snoozedUntil?: string; dismissed?: boolean }) => {
    const next = { date: today, ...state };
    storage.saveReminderState(next);
    setReminderState(next);
  };

  useEffect(() => {
    if (remind) showSystemNotification(Math.floor(secs / 60), settings.dailyGoalMinutes);
    // chỉ báo một lần khi chuyển sang trạng thái cần nhắc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remind]);

  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')} / ${settings.dailyGoalMinutes}:00`;

  return (
    <div className={open ? 'card !p-3' : ''}>
      {!open && (
        <button className="chip gap-1.5 font-mono tabular-nums" aria-label="Hiện thanh thời gian" aria-expanded={false} onClick={toggle}>
          <span data-testid="timer">{clock}</span>
          <ChevronDown size={14} />
        </button>
      )}
      {open && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span data-testid="timer" className="min-w-28 font-mono text-base font-semibold tabular-nums">
          {clock}
        </span>
        <progress className="order-last h-2 w-full sm:order-none sm:w-auto sm:min-w-24 sm:flex-1" value={Math.min(secs, goal)} max={goal} />
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-icon" aria-label={running ? 'Tạm dừng' : 'Tiếp tục'} onClick={() => setRunning((r) => !r)}>
            {running ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="btn-icon" aria-label="Cộng 1 phút" onClick={() => add(60)}><Plus size={18} /></button>
          <span className="chip ml-1 gap-1 bg-gold text-gold-ink"><Flame size={14} /> {calculateStreak(records, today)} ngày</span>
          <button className="btn-icon" aria-label="Ẩn thanh thời gian" aria-expanded onClick={toggle}><ChevronUp size={18} /></button>
        </div>
      </div>}
      {remind && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gold px-3 py-2 text-sm text-gold-ink">
          <span>Đến giờ học rồi! Hôm nay bạn chưa đủ {settings.dailyGoalMinutes} phút.</span>
          <button className="min-h-9 underline" onClick={() => hold({ snoozedUntil: snoozeUntil(hhmm, 10) })}>Nhắc lại sau 10 phút</button>
          <button className="min-h-9 underline" onClick={() => hold({ dismissed: true })}>Bỏ qua hôm nay</button>
        </div>
      )}
    </div>
  );
}
