import { defaultSegmenter } from '../dictionary';
import type { IMetaStore } from '../../services/storage/types';
import { OfflineSmartTranslator, type ITranslationProvider } from './ChineseToVietNovelTranslator';
import { DEFAULT_GEMINI_MODEL, GeminiNovelTranslator, type GeminiOptions } from './GeminiNovelTranslator';

export interface TranslationSettings {
  geminiApiKey?: string;
  model: string;
}

const KEY = 'translation';

/** Cài đặt nằm trong IndexedDB để cả Service Worker (không có localStorage) cũng đọc được. */
export async function loadTranslationSettings(meta: IMetaStore): Promise<TranslationSettings> {
  const s = await meta.get<TranslationSettings>('app_settings', KEY);
  return { model: s?.model || DEFAULT_GEMINI_MODEL, geminiApiKey: s?.geminiApiKey?.trim() || undefined };
}

export async function saveTranslationSettings(meta: IMetaStore, s: TranslationSettings): Promise<void> {
  await meta.put('app_settings', KEY, { model: s.model || DEFAULT_GEMINI_MODEL, geminiApiKey: s.geminiApiKey?.trim() || undefined });
}

/** Có Gemini key → dịch theo ngữ cảnh bằng Gemini; chưa có → dịch offline theo từ điển. */
export async function createTranslationProvider(
  meta: IMetaStore, extra: Omit<GeminiOptions, 'apiKey' | 'model'> = {},
): Promise<ITranslationProvider> {
  const s = await loadTranslationSettings(meta);
  if (s.geminiApiKey) return new GeminiNovelTranslator({ ...extra, apiKey: s.geminiApiKey, model: s.model });
  return new OfflineSmartTranslator(defaultSegmenter);
}
