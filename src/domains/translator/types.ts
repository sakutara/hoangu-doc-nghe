export type TranslationJobStatus = 'idle' | 'running' | 'paused_at_deadpoint' | 'paused_by_user' | 'completed';

export interface TranslationDeadPointCheckpoint {
  failedChapterIndex: number;
  lastTranslatedChapterIndex: number;
  errorReason: string;
  failedAt: string;
  retryCount: number;
}

export interface TranslationJob {
  jobId: string;
  sourceBookId: string;
  targetBookId: string;
  sourceTitle: string;
  translatedTitle: string;
  status: TranslationJobStatus;
  totalChapters: number;
  translatedChaptersCount: number;
  nextChapterIndex: number;
  deadPoint?: TranslationDeadPointCheckpoint;
  /** Bảng tên riêng/thuật ngữ đã dịch (ZH → VI), giữ nhất quán giữa các chương. */
  glossary?: Record<string, string>;
  updatedAt: string;
}
