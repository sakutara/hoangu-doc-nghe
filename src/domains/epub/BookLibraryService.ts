import type { TranslationJob } from '../translator/types';
import type { BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata, IMetaStore } from '../../services/storage/types';

export class BookLibraryService {
  constructor(private meta: IMetaStore, private files: BookFileSystemStore) {}

  async listAllBooks(): Promise<BookMetadata[]> {
    const books = await this.meta.list<BookMetadata>('books_metadata');
    return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBook(bookId: string) { return this.meta.get<BookMetadata>('books_metadata', bookId); }
  saveBook(book: BookMetadata) { return this.meta.put('books_metadata', book.bookId, book); }

  async deleteBookCompletely(bookId: string): Promise<void> {
    for (const j of await this.meta.list<{ jobId: string; bookId: string }>('crawl_jobs')) {
      if (j.bookId === bookId) await this.meta.delete('crawl_jobs', j.jobId);
    }
    for (const j of await this.meta.list<TranslationJob>('translation_jobs')) {
      if (j.sourceBookId === bookId || j.targetBookId === bookId) await this.meta.delete('translation_jobs', j.jobId);
    }
    await this.files.deleteBookDirectory(bookId);
    await this.meta.delete('books_metadata', bookId);
  }
}
