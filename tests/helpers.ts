import { createServices } from '../src/services/appServices';
import { InMemoryFileBackend, InMemoryMetaStore } from '../src/services/storage/MemoryBackends';

export function memStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
}

export function testServices() {
  return createServices(new InMemoryMetaStore(), new InMemoryFileBackend(), memStorage());
}
