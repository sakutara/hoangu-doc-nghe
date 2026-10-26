import type { CollectionName, IFileBackend, IMetaStore } from './types';

const DB_NAME = 'hoangu-db';
const FILE_STORE = 'chapter_files';
const COLLECTIONS: CollectionName[] = ['books_metadata', 'crawl_jobs', 'translation_jobs', 'saved_words', 'study_records', 'app_settings'];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      for (const c of COLLECTIONS) if (!req.result.objectStoreNames.contains(c)) req.result.createObjectStore(c);
      if (!req.result.objectStoreNames.contains(FILE_STORE)) req.result.createObjectStore(FILE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(c: CollectionName | typeof FILE_STORE, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) => new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(c, mode).objectStore(c));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    }),
  );
}

export class IdbMetaStore implements IMetaStore {
  get<T>(c: CollectionName, key: string) { return run<T | undefined>(c, 'readonly', (s) => s.get(key)); }
  async put<T>(c: CollectionName, key: string, value: T) { await run(c, 'readwrite', (s) => s.put(value, key)); }
  async delete(c: CollectionName, key: string) { await run(c, 'readwrite', (s) => s.delete(key)); }
  list<T>(c: CollectionName) { return run<T[]>(c, 'readonly', (s) => s.getAll()); }
}

/**
 * Lưu file chương trong IndexedDB. Dùng khi trình duyệt (đặc biệt iOS Safari) có OPFS nhưng thiếu
 * `createWritable()` nên không ghi file được. Khoá = `<dir>/<name>`.
 */
export class IdbFileBackend implements IFileBackend {
  private range(dir: string) { return IDBKeyRange.bound(`${dir}/`, `${dir}/\uffff`); }
  async write(dir: string, name: string, text: string) { await run(FILE_STORE, 'readwrite', (s) => s.put(text, `${dir}/${name}`)); }
  async read(dir: string, name: string) { return (await run<string | undefined>(FILE_STORE, 'readonly', (s) => s.get(`${dir}/${name}`))) ?? null; }
  async list(dir: string) {
    const keys = await run<string[]>(FILE_STORE, 'readonly', (s) => s.getAllKeys(this.range(dir)));
    return keys.map((k) => k.slice(dir.length + 1)).sort();
  }
  async removeDir(dir: string) {
    await run(FILE_STORE, 'readwrite', (s) => s.delete(this.range(dir)));
    return true;
  }
}
