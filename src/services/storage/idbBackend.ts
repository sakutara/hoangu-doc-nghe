import type { CollectionName, IMetaStore } from './types';

const DB_NAME = 'hoangu-db';
const COLLECTIONS: CollectionName[] = ['books_metadata', 'crawl_jobs', 'translation_jobs', 'saved_words', 'study_records', 'app_settings'];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      for (const c of COLLECTIONS) if (!req.result.objectStoreNames.contains(c)) req.result.createObjectStore(c);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(c: CollectionName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
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
