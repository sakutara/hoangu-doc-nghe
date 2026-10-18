export type CrawlJobStatus = 'idle' | 'running' | 'paused_at_deadpoint' | 'paused_by_user' | 'completed';

export interface DeadPointCheckpoint {
  failedUrl: string;
  failedChapterIndex: number;
  lastSuccessChapterUrl?: string;
  errorReason: string;
  errorKind?: 'bot_challenge';
  failedAt: string;
  retryCount: number;
}

export interface CrawlJob {
  jobId: string;
  bookId: string;
  bookTitle: string;
  startUrl: string;
  currentTargetUrl?: string;
  lastSuccessChapterUrl?: string;
  status: CrawlJobStatus;
  chaptersCrawled: number;
  maxChaptersLimit: number;
  deadPoint?: DeadPointCheckpoint;
  updatedAt: string;
}
