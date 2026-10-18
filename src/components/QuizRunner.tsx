import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { QuizQuestion } from '../domains/curriculum/types';
import { scoreQuiz } from '../domains/curriculum/QuizEngine';
import { speakChinese } from '../services/SpeechService';

export interface QuizRunnerProps {
  questions: QuizQuestion[];
  onFinish: (result: ReturnType<typeof scoreQuiz>) => void;
  onRetry: () => void;
  renderNext?: () => React.ReactNode;
}

export function QuizRunner({ questions, onFinish, onRetry, renderNext }: QuizRunnerProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Array<number | undefined>>([]);
  const [result, setResult] = useState<ReturnType<typeof scoreQuiz> | null>(null);

  if (result) {
    return (
      <div role="status" className="card space-y-3 text-center">
        <p className="text-2xl font-bold text-brand">Kết quả: {result.correct}/{result.total} ({result.percent}%)</p>
        <p>{result.passed ? 'Đạt! Bài kế tiếp đã được mở khóa.' : 'Chưa đạt 80%. Hãy ôn lại và làm lại nhé.'}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn" onClick={() => { setStep(0); setAnswers([]); setResult(null); onRetry(); }}>Làm lại</button>
          {result.passed && renderNext?.()}
        </div>
      </div>
    );
  }

  const q = questions[step];
  const picked = answers[step];
  const answered = picked !== undefined;
  const last = step === questions.length - 1;

  const choose = (i: number) => {
    if (answered) return;
    const next = [...answers];
    next[step] = i;
    setAnswers(next);
  };
  const advance = () => {
    if (!last) return setStep(step + 1);
    const r = scoreQuiz(questions, answers);
    setResult(r);
    onFinish(r);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-muted">Câu {step + 1}/{questions.length}</div>
      <progress className="w-full" value={step + (answered ? 1 : 0)} max={questions.length} />
      <div className="flex items-center gap-2 text-2xl font-semibold" lang={q.kind === 'viet_to_hanzi' ? 'vi' : 'zh-CN'}>
        {q.kind === 'listen_meaning' ? (
          <button className="btn btn-primary" onClick={() => speakChinese(q.audioText!)}>
            <Volume2 size={18} /> Nghe
          </button>
        ) : (
          <span>{q.prompt}</span>
        )}
      </div>
      {q.kind === 'listen_meaning' && <div className="text-sm">{q.prompt}</div>}
      {q.kind === 'hanzi_to_viet' && <div className="text-sm">Chọn nghĩa tiếng Việt đúng</div>}
      {q.kind === 'viet_to_hanzi' && <div className="text-sm">Chọn chữ Hán đúng</div>}
      {q.kind === 'read_translation' && <div className="text-sm">Chọn bản dịch đúng</div>}
      <ul className="fluid-grid-sm">
        {q.options.map((o, i) => {
          const state = !answered ? '' : i === q.answerIndex ? 'border-ok bg-ok-soft' : i === picked ? 'border-bad bg-bad-soft' : 'opacity-70';
          return (
            <li key={o}>
              <button lang={q.kind === 'viet_to_hanzi' ? 'zh-CN' : undefined} className={`btn !h-auto min-h-12 w-full !justify-start !whitespace-normal py-3 text-left text-base ${q.kind === 'viet_to_hanzi' ? 'text-2xl' : ''} ${state}`} onClick={() => choose(i)}>{o}</button>
            </li>
          );
        })}
      </ul>
      {answered && (
        <>
          <p role="alert" className="font-medium">{picked === q.answerIndex ? 'Chính xác!' : `Sai rồi. Đáp án: ${q.options[q.answerIndex]}`}</p>
          <button className="btn btn-primary w-full sm:w-auto" onClick={advance}>{last ? 'Xem kết quả' : 'Câu tiếp'}</button>
        </>
      )}
    </div>
  );
}
