import { handleJobMessage, type JobEnv, type JobMessage } from '../sw/jobHandlers';
import { services } from './appServices';

const NAME = 'hoangu-progress';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NAME) : null;

/** BroadcastChannel không gửi lại cho chính instance đã post → mỗi listener dùng instance riêng. */
export function onProgress(cb: (data: any) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const rx = new BroadcastChannel(NAME);
  rx.onmessage = (e) => cb(e.data);
  return () => rx.close();
}

/** Gửi job cho Service Worker; không có SW thì chạy ngay trên main thread. */
export async function dispatchJob(msg: JobMessage): Promise<void> {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg?.active) {
    reg.active.postMessage(msg);
    try {
      await (reg as any).sync?.register('resume-jobs');
    } catch { /* Background Sync không khả dụng */ }
    return;
  }
  const env: JobEnv = {
    meta: services.meta, backend: services.backend,
    broadcast: (d) => channel?.postMessage(d),
  };
  void handleJobMessage(msg, env);
}
