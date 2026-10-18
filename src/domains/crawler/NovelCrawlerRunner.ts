import type { BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import { chapterFileName } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata, IMetaStore } from '../../services/storage/types';
import { BotChallengeError } from './CorsFetchPipeline';
import { extractChapterFromHtml } from './HtmlNovelExtractor';
import type { CrawlJob } from './types';

export interface CrawlerDeps {
  meta: IMetaStore;
  files: BookFileSystemStore;
  fetchHtml: (url: string) => Promise<string>;
  onProgress?: (job: CrawlJob) => void;
  shouldStop?: () => boolean;
}

export class NovelCrawlerRunner {
  constructor(private d: CrawlerDeps) {}

  async createJob(bookId: string, bookTitle: string, startUrl: string, maxChaptersLimit = 0): Promise<CrawlJob> {
    const job: CrawlJob = {
      jobId: `crawl-${bookId}`, bookId, bookTitle, startUrl, currentTargetUrl: startUrl,
      status: 'idle', chaptersCrawled: 0, maxChaptersLimit, updatedAt: new Date().toISOString(),
    };
    const book: BookMetadata = {
      bookId, title: bookTitle, language: 'zh', originType: 'web_crawl', chapterCount: 0,
      chapters: [], lastReadChapterIndex: 1, createdAt: new Date().toISOString(),
    };
    await this.d.meta.put('books_metadata', bookId, book);
    await this.d.meta.put('crawl_jobs', job.jobId, job);
    return job;
  }

  private async save(job: CrawlJob) {
    job.updatedAt = new Date().toISOString();
    await this.d.meta.put('crawl_jobs', job.jobId, job);
    this.d.onProgress?.(job);
  }

  /** Bắt đầu hoặc nối lại từ điểm chết (cùng một đường code). */
  async startOrResume(jobId: string): Promise<CrawlJob> {
    const job = await this.d.meta.get<CrawlJob>('crawl_jobs', jobId);
    if (!job) throw new Error(`Không có crawl job ${jobId}`);
    const book = (await this.d.meta.get<BookMetadata>('books_metadata', job.bookId))!;

    let url = job.deadPoint?.failedUrl ?? job.currentTargetUrl ?? job.startUrl;
    let index = job.deadPoint?.failedChapterIndex ?? book.chapterCount + 1;
    const retry = job.deadPoint?.retryCount ?? 0;
    job.status = 'running';
    let batch = 0;
    await this.save(job);

    while (true) {
      if (this.d.shouldStop?.()) { job.status = 'paused_by_user'; break; }
      if (job.maxChaptersLimit > 0 && batch >= job.maxChaptersLimit) { job.status = 'paused_by_user'; break; }
      try {
        const html = await this.d.fetchHtml(url);
        const ch = extractChapterFromHtml(html, url);
        if (ch.paragraphs.length === 0) throw new Error('Nội dung chương rỗng (ParseFailure)');
        const title = ch.title || `Chương ${index}`;
        await this.d.files.writeChapterFile(job.bookId, { index, title, paragraphs: ch.paragraphs });
        book.chapters.push({ index, title, fileName: chapterFileName(index) });
        book.chapterCount = index;
        await this.d.meta.put('books_metadata', book.bookId, book);
        job.lastSuccessChapterUrl = url;
        job.chaptersCrawled = index;
        job.deadPoint = undefined;
        batch += 1;
        if (!ch.hasNextChapter) { job.currentTargetUrl = undefined; job.status = 'completed'; break; }
        url = ch.nextChapterUrl!;
        job.currentTargetUrl = url;
        index += 1;
        await this.save(job);
      } catch (e) {
        job.status = 'paused_at_deadpoint';
        job.deadPoint = {
          failedUrl: url, failedChapterIndex: index, lastSuccessChapterUrl: job.lastSuccessChapterUrl,
          errorReason: e instanceof Error ? e.message : String(e),
          ...(e instanceof BotChallengeError ? { errorKind: 'bot_challenge' as const } : {}),
          failedAt: new Date().toISOString(), retryCount: retry + 1,
        };
        break;
      }
    }
    await this.save(job);
    return job;
  }

  /** Mở lại chương cuối để xem tác giả đã ra chương mới chưa. */
  async checkForNewChapters(jobId: string): Promise<CrawlJob> {
    const job = await this.d.meta.get<CrawlJob>('crawl_jobs', jobId);
    if (!job?.lastSuccessChapterUrl) throw new Error('Chưa có chương nào để dò chương mới');
    const html = await this.d.fetchHtml(job.lastSuccessChapterUrl);
    const next = extractChapterFromHtml(html, job.lastSuccessChapterUrl);
    if (!next.hasNextChapter) return job;
    job.currentTargetUrl = next.nextChapterUrl;
    job.deadPoint = undefined;
    await this.d.meta.put('crawl_jobs', job.jobId, job);
    return this.startOrResume(jobId);
  }
}
