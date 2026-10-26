# ADR-006: Lưu Trữ Truyện Theo Thư Mục/File Chương (OPFS), Tinh Giản Văn Bản Thuần, Xóa Truyện & Dịch Truyện Chạy Ngầm (ZH $\rightarrow$ VI)

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/documents/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/documents/SA-MASTER.md), [ADR-002](file:///Users/sakutara/Work/chinese-study/documents/adr/ADR-002-offline-storage-and-dictionary-engine.md), [ADR-005](file:///Users/sakutara/Work/chinese-study/documents/adr/ADR-005-service-worker-novel-crawler-and-epub-export.md)

## 1. Bối cảnh (Context)
Một bộ tiểu thuyết mạng tiếng Hoa thường có từ 500 đến hơn 3.000 chương. Nếu lưu toàn bộ nội dung các chương vào một đối tượng JSON trong RAM hoặc nhồi chung vào một bản ghi IndexedDB, ứng dụng sẽ gặp các vấn đề nghiêm trọng trên điện thoại:
1. **Quá tải bộ nhớ RAM (Out-Of-Memory / Crash tab):** Khi mở danh sách truyện, mở trình đọc, cào thêm chương mới hoặc dịch truyện, việc load cả bộ truyện vào RAM sẽ làm đơ thiết bị.
2. **Rác dung lượng từ hình ảnh & định dạng:** Các file `.epub` tải lên hoặc trang web cào về thường chứa ảnh minh họa nặng, CSS phức tạp và các thẻ HTML lồng nhau không cần thiết cho mục tiêu học đọc chữ.
3. **Nhu cầu Dịch Truyện Chạy Ngầm (Tiếng Hoa $\rightarrow$ Tiếng Việt):** Người học muốn có khả năng chọn một bộ truyện tiếng Hoa sẵn có trong ứng dụng để dịch toàn bộ sang một bộ truyện tiếng Việt mới (có tiêu đề truyện tiếng Việt, lưu trong DB/File System của app), chạy ngầm bằng Service Worker kể cả khi tắt màn hình, và có cơ chế lưu/chạy tiếp từ "Điểm chết" nếu quá trình dịch gặp lỗi giữa chừng.
4. **Nhu cầu Quản lý & Xóa Truyện Triệt để:** Người dùng cần một trang quản lý danh sách tất cả các bộ truyện trong app và có thể xóa hoàn toàn một bộ truyện (xóa sạch toàn bộ nội dung file chương lẫn metadata) để giải phóng bộ nhớ.

## 2. Quyết định (Decision)

### 2.1 Kiến trúc Lưu trữ File Theo Thư Mục & Từng Chương (`BookFileSystemStore` trên OPFS)
* Sử dụng **Origin Private File System (OPFS — `navigator.storage.getDirectory()`)** của trình duyệt (có thể truy cập trực tiếp từ cả **Main Thread** và **Service Worker**) làm nơi lưu trữ nội dung chương truyện trên đĩa:
  * **Mỗi bộ truyện 1 thư mục riêng:** `/books/<bookId>/`
  * **Mỗi chương 1 file văn bản riêng:** `/books/<bookId>/chapter-0001.txt`, `/books/<bookId>/chapter-0002.txt`, ...
* **Tách biệt hoàn toàn Metadata (DB) và Nội dung (File):**
  * Trong `IndexedDB` (`books_metadata`), chỉ lưu thông tin nhẹ: `bookId`, `title`, `language` (`'zh' | 'vi'`), `originType` (`'epub_upload' | 'web_crawl' | 'translated_vi'`), `sourceBookId` (nếu là bản dịch), `chapterCount`, và mảng mục lục mỏng `chapters: Array<{ index: number; title: string; fileName: string }>`.
  * Khi người dùng mở trang **Quản lý Tủ Truyện**, ứng dụng chỉ đọc `books_metadata` (vài KB).
  * Khi người dùng mở đọc chương $k$, ứng dụng chỉ gọi `BookFileSystemStore.readChapterFile(bookId, k)` để nạp đúng 1 file chương đó (vài chục KB) vào RAM.

### 2.2 Quy Tắc Tinh Giản Hóa Tuyệt Đối (`PlainTextSanitizer` — Chỉ Lưu Nội Dung Chữ)
* Mọi luồng đầu vào nội dung truyện (**Upload file `.epub`** và **Cào truyện Online**) đều bắt buộc đi qua bộ lọc `PlainTextSanitizer`:
  1. **Không lưu hình ảnh:** Bỏ qua toàn bộ file ảnh trong gói ZIP `.epub` (`.jpg`, `.png`, `.gif`, `.webp`, `.svg`) và xóa sạch các thẻ `<img>`, `<svg>`, `<picture>`, `<figure>`, `<canvas>`, `<video>`.
  2. **Không lưu định dạng:** Xóa sạch các file `.css`, thẻ `<style>`, thuộc tính `style="..."`, `class="..."`, font chữ nhúng, chỉ giữ lại tiêu đề chương và mảng các đoạn văn bản thuần (`paragraphs: string[]`) được ngăn cách bằng ký tự xuống dòng `\n`.

### 2.3 Bộ Dịch Truyện Chạy Ngầm (Tiếng Hoa $\rightarrow$ Tiếng Việt) bằng Service Worker (`NovelTranslationRunner`)
* Khi người dùng chọn một bộ truyện tiếng Hoa (`sourceBookId`) và kích hoạt **"Dịch sang Tiếng Việt"**:
  1. **Khởi tạo Bộ Truyện Tiếng Việt Mới:**
     * Dịch tiêu đề bộ truyện sang tiếng Việt (ví dụ: `"凡人修仙传"` $\rightarrow$ `"Phàm Nhân Tu Tiên Truyện"`), tạo `targetBookId` mới trong `books_metadata` (`language: 'vi'`, `sourceBookId`) và tạo thư mục `/books/<targetBookId>/`.
  2. **Chạy Ngầm Từng Chương trong Service Worker:**
     * Vòng lặp dịch chạy trong Custom Service Worker (`ExtendableEvent.waitUntil` + `Background Sync`).
     * Ở bước thứ $k$, Service Worker đọc duy nhất file `/books/<sourceBookId>/chapter-kkkk.txt`, dịch tiêu đề chương và từng đoạn văn sang tiếng Việt (hỗ trợ chế độ **Offline Smart Phrase/Viet Translator** tốc độ cao hoặc **Configurable Online Translation API**; mặc định online là `GeminiNovelTranslator` dịch theo ngữ cảnh cả đoạn với Gemini API key miễn phí, key lưu trong IndexedDB `app_settings` để Service Worker đọc được), sau đó ghi ngay ra file `/books/<targetBookId>/chapter-kkkk.txt`.
  3. **Lưu "Điểm Chết Dịch Thuật" (`TranslationDeadPointCheckpoint`) & Dịch Tiếp:**
     * Nếu việc dịch chương $k$ bị lỗi (timeout, mất mạng, rate-limit hoặc bị gián đoạn), Service Worker lưu `deadPoint = { failedChapterIndex: k, lastTranslatedChapterIndex: k - 1, errorReason, failedAt, retryCount }` vào bảng `translation_jobs` trong DB và chuyển sang trạng thái `'paused_at_deadpoint'`.
     * Khi người dùng bấm **"Dịch tiếp từ điểm chết"**, tiến trình đọc lại `failedChapterIndex = k` và tiếp tục dịch từ chương $k$ trở đi mà không phải dịch lại các chương $1 \dots k-1$.

### 2.4 Quản Lý Danh Sách Truyện & Xóa Truyện Nguyên Tử (`Atomic Book Deletion`)
* Khi người dùng bấm **"Xóa truyện"** tại trang Quản lý Tủ Truyện:
  1. Nếu truyện đang có tác vụ cào hoặc dịch chạy ngầm, dừng tác vụ đó ngay lập tức.
  2. Gọi `BookFileSystemStore.deleteBookDirectory(bookId)` (`booksRootDir.removeEntry(bookId, { recursive: true })`) để xóa toàn bộ thư mục truyện và tất cả các file chương trên đĩa.
  3. Xóa bản ghi `BookMetadata` và các bản ghi `CrawlJob` / `TranslationJob` liên quan khỏi `IndexedDB`.

## 3. Hệ quả (Consequences)
* **Tích cực:**
  * Mức tiêu thụ RAM khi đọc truyện hoặc duyệt tủ sách giữ ở mức tối thiểu ($\sim 1\text{--}2\text{MB}$ bất kể bộ truyện có 10 chương hay 5.000 chương).
  * Dung lượng lưu trữ giảm 80%–95% nhờ loại bỏ ảnh và định dạng rác.
  * Người học có thể vừa đọc bản gốc tiếng Hoa (tra từ chạm), vừa tạo bản dịch tiếng Việt toàn bộ truyện chạy ngầm khi tắt màn hình điện thoại để đối chiếu cốt truyện.
