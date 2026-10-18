import type { BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import { chapterFileName } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata, IMetaStore } from '../../services/storage/types';
import type { ITranslationProvider } from './ChineseToVietNovelTranslator';
import type { TranslationJob } from './types';

export interface TranslatorDeps {
  meta: IMetaStore;
  files: BookFileSystemStore;
  provider: ITranslationProvider;
  onProgress?: (job: TranslationJob) => void;
  shouldStop?: () => boolean;
}

export class NovelTranslationRunner {
  constructor(private d: TranslatorDeps) {}

  async createJob(sourceBookId: string): Promise<TranslationJob> {
    const src = await this.d.meta.get<BookMetadata>('books_metadata', sourceBookId);
    if (!src) throw new Error('Không tìm thấy truyện gốc');
    if (src.language !== 'zh') throw new Error('Chỉ dịch được truyện tiếng Hoa');
    const translatedTitle = await this.d.provider.translateBookTitle(src.title);
    const targetBookId = `${sourceBookId}-vi`;
    const target: BookMetadata = {
      bookId: targetBookId, title: translatedTitle, author: src.author, language: 'vi',
      originType: 'translated_vi', sourceBookId, chapterCount: 0, chapters: [],
      lastReadChapterIndex: 1, createdAt: new Date().toISOString(),
    };
    const job: TranslationJob = {
      jobId: `translate-${sourceBookId}`, sourceBookId, targetBookId, sourceTitle: src.title,
      translatedTitle, status: 'idle', totalChapters: src.chapterCount, translatedChaptersCount: 0,
      nextChapterIndex: 1, updatedAt: new Date().toISOString(),
    };
    await this.d.meta.put('books_metadata', targetBookId, target);
    await this.d.meta.put('translation_jobs', job.jobId, job);
    return job;
  }

  /** Dịch lại từ đầu (vd. sau khi chuyển sang Gemini): ghi đè các file chương đã dịch. */
  async resetJob(jobId: string): Promise<TranslationJob> {
    const job = await this.d.meta.get<TranslationJob>('translation_jobs', jobId);
    if (!job) throw new Error(`Không có translation job ${jobId}`);
    const src = await this.d.meta.get<BookMetadata>('books_metadata', job.sourceBookId);
    const target = await this.d.meta.get<BookMetadata>('books_metadata', job.targetBookId);
    if (src && target) {
      target.title = job.translatedTitle = await this.d.provider.translateBookTitle(src.title);
      await this.d.meta.put('books_metadata', target.bookId, target);
    }
    Object.assign(job, { status: 'idle', translatedChaptersCount: 0, nextChapterIndex: 1, deadPoint: undefined, glossary: undefined });
    await this.save(job);
    return job;
  }

  private async save(job: TranslationJob) {
    job.updatedAt = new Date().toISOString();
    await this.d.meta.put('translation_jobs', job.jobId, job);
    this.d.onProgress?.(job);
  }

  async startOrResume(jobId: string): Promise<TranslationJob> {
    const job = await this.d.meta.get<TranslationJob>('translation_jobs', jobId);
    if (!job) throw new Error(`Không có translation job ${jobId}`);
    const src = (await this.d.meta.get<BookMetadata>('books_metadata', job.sourceBookId))!;
    const target = (await this.d.meta.get<BookMetadata>('books_metadata', job.targetBookId))!;
    const start = job.deadPoint?.failedChapterIndex ?? job.nextChapterIndex;
    const retry = job.deadPoint?.retryCount ?? 0;
    job.status = 'running';
    job.totalChapters = src.chapterCount; // truyện nguồn có thể đã được cào thêm
    await this.save(job);

    for (let i = start; i <= src.chapterCount; i++) {
      if (this.d.shouldStop?.()) { job.status = 'paused_by_user'; await this.save(job); return job; }
      try {
        const ch = await this.d.files.readChapterFile(job.sourceBookId, i);
        if (!ch) throw new Error(`Thiếu file chương gốc ${chapterFileName(i)}`);
        let title: string, paragraphs: string[];
        if (this.d.provider.translateChapter) {
          const r = await this.d.provider.translateChapter(ch, job.glossary ?? {});
          ({ title, paragraphs } = r);
          job.glossary = r.glossary;
        } else {
          title = await this.d.provider.translateChapterTitle(ch.title);
          paragraphs = await this.d.provider.translateParagraphs(ch.paragraphs);
        }
        const blocks = ch.blocks?.map((b, k) => ({ tag: b.tag, text: paragraphs[k] ?? '' }));
        await this.d.files.writeChapterFile(job.targetBookId, { index: i, title, paragraphs, blocks });
        const entry = target.chapters.find((c) => c.index === i);
        if (entry) entry.title = title;
        else target.chapters.push({ index: i, title, fileName: chapterFileName(i) });
        target.chapterCount = Math.max(target.chapterCount, i);
        await this.d.meta.put('books_metadata', target.bookId, target);
        job.translatedChaptersCount = i;
        job.nextChapterIndex = i + 1;
        job.deadPoint = undefined;
        await this.save(job);
      } catch (e) {
        job.status = 'paused_at_deadpoint';
        job.deadPoint = {
          failedChapterIndex: i, lastTranslatedChapterIndex: i - 1,
          errorReason: e instanceof Error ? e.message : String(e),
          failedAt: new Date().toISOString(), retryCount: retry + 1,
        };
        await this.save(job);
        return job;
      }
    }
    job.status = 'completed';
    await this.save(job);
    return job;
  }
}
