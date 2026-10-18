import type { IFileBackend } from './types';

async function booksRoot(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('books', { create });
}

/** OPFS dùng được cả ở main thread lẫn service worker (createWritable). */
export class OpfsFileBackend implements IFileBackend {
  async write(dir: string, name: string, text: string) {
    const d = await (await booksRoot(true)).getDirectoryHandle(dir, { create: true });
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
  async read(dir: string, name: string) {
    try {
      const d = await (await booksRoot(true)).getDirectoryHandle(dir);
      return await (await (await d.getFileHandle(name)).getFile()).text();
    } catch {
      return null;
    }
  }
  async list(dir: string) {
    try {
      const d = await (await booksRoot(true)).getDirectoryHandle(dir);
      const names: string[] = [];
      for await (const [name] of d.entries()) names.push(name as string);
      return names.sort();
    } catch {
      return [];
    }
  }
  async removeDir(dir: string) {
    try {
      await (await booksRoot(true)).removeEntry(dir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
