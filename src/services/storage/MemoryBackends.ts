import type { CollectionName, IFileBackend, IMetaStore } from './types';

export class InMemoryMetaStore implements IMetaStore {
  private data = new Map<string, Map<string, unknown>>();
  private col(c: CollectionName) {
    let m = this.data.get(c);
    if (!m) this.data.set(c, (m = new Map()));
    return m;
  }
  async get<T>(c: CollectionName, key: string) { return this.col(c).get(key) as T | undefined; }
  async put<T>(c: CollectionName, key: string, value: T) { this.col(c).set(key, structuredClone(value)); }
  async delete(c: CollectionName, key: string) { this.col(c).delete(key); }
  async list<T>(c: CollectionName) { return [...this.col(c).values()] as T[]; }
}

export class InMemoryFileBackend implements IFileBackend {
  private dirs = new Map<string, Map<string, string>>();
  async write(dir: string, name: string, text: string) {
    let d = this.dirs.get(dir);
    if (!d) this.dirs.set(dir, (d = new Map()));
    d.set(name, text);
  }
  async read(dir: string, name: string) { return this.dirs.get(dir)?.get(name) ?? null; }
  async list(dir: string) { return [...(this.dirs.get(dir)?.keys() ?? [])].sort(); }
  async removeDir(dir: string) { return this.dirs.delete(dir); }
}
