export type CollectionName =
  | 'books_metadata' | 'crawl_jobs' | 'translation_jobs' | 'saved_words' | 'study_records' | 'app_settings';

export interface IMetaStore {
  get<T>(collection: CollectionName, key: string): Promise<T | undefined>;
  put<T>(collection: CollectionName, key: string, value: T): Promise<void>;
  delete(collection: CollectionName, key: string): Promise<void>;
  list<T>(collection: CollectionName): Promise<T[]>;
}

export interface IFileBackend {
  write(dir: string, name: string, text: string): Promise<void>;
  read(dir: string, name: string): Promise<string | null>;
  list(dir: string): Promise<string[]>;
  removeDir(dir: string): Promise<boolean>;
}

export interface BookMetadata {
  bookId: string;
  title: string;
  author?: string;
  language: 'zh' | 'vi';
  originType: 'epub_upload' | 'file_upload' | 'web_crawl' | 'translated_vi';
  sourceBookId?: string;
  /** Khoá nguồn (URL mục lục/chương đầu) để nối tiếp các lượt tải qua trình duyệt. */
  sourceUrl?: string;
  /** URL chương đã nhập, theo thứ tự chỉ số — để bỏ trùng khi nối tiếp. */
  chapterUrls?: string[];
  chapterCount: number;
  chapters: Array<{ index: number; title: string; fileName: string }>;
  lastReadChapterIndex: number;
  createdAt: string;
}
