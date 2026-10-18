import { fetchHtml } from '../domains/crawler/CorsFetchPipeline';
import { NovelCrawlerRunner } from '../domains/crawler/NovelCrawlerRunner';
import { createTranslationProvider } from '../domains/translator/createTranslationProvider';
import { NovelTranslationRunner } from '../domains/translator/NovelTranslationRunner';
import { BookFileSystemStore } from '../services/storage/BookFileSystemStore';
import type { IFileBackend, IMetaStore } from '../services/storage/types';
import type { CrawlJob } from '../domains/crawler/types';
import type { TranslationJob } from '../domains/translator/types';

export type JobMessage =
  | { type: 'START_CRAWL' | 'RESUME_FROM_DEADPOINT' | 'CHECK_NEW_CHAPTERS'; jobId: string }
  | { type: 'START_TRANSLATION' | 'RESUME_TRANSLATION'; jobId: string }
  | { type: 'PAUSE_JOB'; jobId: string };

export interface JobEnv {
  meta: IMetaStore;
  backend: IFileBackend;
  broadcast: (data: unknown) => void;
  fetchHtml?: (url: string) => Promise<string>;
}

const stopped = new Set<string>();

/** Dùng chung cho Service Worker và fallback main-thread. */
export async function handleJobMessage(msg: JobMessage, env: JobEnv): Promise<void> {
  const files = new BookFileSystemStore(env.backend);
  if (msg.type === 'PAUSE_JOB') { stopped.add(msg.jobId); return; }
  stopped.delete(msg.jobId);
  const shouldStop = () => stopped.has(msg.jobId);
  try {
    if (msg.type === 'START_TRANSLATION' || msg.type === 'RESUME_TRANSLATION') {
      const runner = new NovelTranslationRunner({
        meta: env.meta, files, provider: await createTranslationProvider(env.meta), shouldStop,
        onProgress: (job: TranslationJob) => env.broadcast({ kind: 'translation', job }),
      });
      await runner.startOrResume(msg.jobId);
      return;
    }
    const runner = new NovelCrawlerRunner({
      meta: env.meta, files, fetchHtml: env.fetchHtml ?? ((u) => fetchHtml(u)), shouldStop,
      onProgress: (job: CrawlJob) => env.broadcast({ kind: 'crawl', job }),
    });
    if (msg.type === 'CHECK_NEW_CHAPTERS') await runner.checkForNewChapters(msg.jobId);
    else await runner.startOrResume(msg.jobId);
  } catch (e) {
    env.broadcast({ kind: 'error', jobId: msg.jobId, reason: e instanceof Error ? e.message : String(e) });
  }
}

/** Tiếp tục mọi job đang 'running' (sau khi SW bị OS ngắt). */
export async function resumeRunningJobs(env: JobEnv): Promise<void> {
  for (const j of await env.meta.list<CrawlJob>('crawl_jobs')) {
    if (j.status === 'running') await handleJobMessage({ type: 'START_CRAWL', jobId: j.jobId }, env);
  }
  for (const j of await env.meta.list<TranslationJob>('translation_jobs')) {
    if (j.status === 'running') await handleJobMessage({ type: 'START_TRANSLATION', jobId: j.jobId }, env);
  }
}
