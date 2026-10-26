import { BookLibraryService } from '../domains/epub/BookLibraryService';
import { BookFileSystemStore } from './storage/BookFileSystemStore';
import { IdbMetaStore } from './storage/idbBackend';
import { InMemoryFileBackend, InMemoryMetaStore } from './storage/MemoryBackends';
import { createFileBackend } from './storage/opfsBackend';
import { StorageService } from './storage/StorageService';
import type { IFileBackend, IMetaStore } from './storage/types';

export interface AppServices {
  storage: StorageService;
  meta: IMetaStore;
  backend: IFileBackend;
  files: BookFileSystemStore;
  library: BookLibraryService;
}

export function createServices(meta: IMetaStore, backend: IFileBackend, kv: Storage): AppServices {
  const files = new BookFileSystemStore(backend);
  return { storage: new StorageService(kv, meta), meta, backend, files, library: new BookLibraryService(meta, files) };
}

const hasIdb = typeof indexedDB !== 'undefined';

/** Production dùng IndexedDB + OPFS; môi trường thiếu API rơi về bộ nhớ. */
export let services: AppServices = createServices(
  hasIdb ? new IdbMetaStore() : new InMemoryMetaStore(),
  hasIdb ? createFileBackend() : new InMemoryFileBackend(),
  typeof localStorage !== 'undefined' ? localStorage : ({ getItem: () => null, setItem: () => {} } as unknown as Storage),
);

export function setServices(s: AppServices) { services = s; }
