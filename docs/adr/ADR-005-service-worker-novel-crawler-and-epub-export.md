# ADR-005: Kiến trúc Cào Truyện Online Ngầm bằng Service Worker, Quản lý Điểm Chết và Xuất File EPUB

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md), [BR-EPIC-05](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-5-novel-crawler-and-epub-export/BR-EPIC-05.md), [SA-EPIC-05](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-5-novel-crawler-and-epub-export/SA-EPIC-05.md)

## 1. Bối cảnh (Context)
Người học tiếng Hoa muốn đọc trực tiếp các bộ tiểu thuyết mạng đang ra (ongoing) hoặc đã hoàn thành từ đường link (URL) online gửi vào ứng dụng. Quy trình này đòi hỏi 4 yêu cầu kỹ thuật đặc thù trên một ứng dụng tĩnh chạy trên GitHub Pages:
1. **Chạy ngầm kể cả khi điện thoại tắt màn hình:** Quá trình tải hàng trăm chương truyện có thể kéo dài nhiều phút. Nếu chỉ chạy trong vòng lặp JavaScript của tab giao diện chính (`Main Thread`), khi người dùng tắt màn hình điện thoại hoặc chuyển sang ứng dụng khác, trình duyệt di động sẽ đóng băng tab ngay lập tức.
2. **Tự động phát hiện và nạp chương mới:** Khi người dùng gửi link mục lục hoặc link 1 chương, hệ thống phải tự động lần theo chương tiếp theo (`下一章` / `下一页`) hoặc quét mục lục để tải tiếp các chương mới ra.
3. **Lưu và nhớ "Điểm chết" (`Dead-Point Checkpoint`) để cào tiếp:** Mạng di động không ổn định, trang truyện có thể giới hạn tốc độ (rate-limit) hoặc hệ điều hành di động có thể thu hồi tiến trình ngầm sau một khoảng thời gian. Hệ thống bắt buộc phải lưu chính xác chương bị lỗi ("điểm chết") vào DB và cho phép cào tiếp từ đúng điểm đó mà không phải cào lại từ đầu.
4. **Đóng gói nội dung đã cào thành file `.epub` để tải về máy:** Người dùng muốn xuất toàn bộ dữ liệu truyện đã cào trong DB ra file `.epub` chuẩn để lưu trữ hoặc chia sẻ.

## 2. Quyết định (Decision)

### 2.1 Thực thi Tiến trình Cào trong Custom Service Worker + IndexedDB (`ServiceWorkerCrawlerEngine`)
* Chuyển cấu hình `vite-plugin-pwa` sang chế độ **`injectManifest`** với file Service Worker tùy chỉnh (`src/sw/custom-sw.ts`).
* **Cơ chế chạy ngầm khi tắt màn hình:**
  1. **Service Worker Execution Context:** Vòng lặp tải chương (`CrawlLoop`) chạy bên trong Service Worker và được giữ sống bằng `ExtendableEvent.waitUntil()` thông qua sự kiện `message` và `sync` (Background Sync API) / `periodicsync`.
  2. **Ghi Trực Tiếp Từng Chương Thành File Riêng trên OPFS (Per-Chapter Atomic File Commit):** Thay vì lưu nội dung chương vào RAM hay nhồi vào một bản ghi IndexedDB lớn, Service Worker sử dụng `BookFileSystemStore` (OPFS) để ghi mỗi chương thành 1 file văn bản độc lập `/books/<bookId>/chapter-XXXX.txt` bên trong thư mục riêng của bộ truyện, và chỉ cập nhật metadata/tiến độ vào `IndexedDB` (xem chi tiết trong [ADR-006](file:///Users/sakutara/Work/chinese-study/docs/adr/ADR-006-opfs-chapter-file-storage-and-background-novel-translator.md)).
  3. **Kết hợp Wake Lock & Notification Keep-Alive:** Trên giao diện chính, ứng dụng yêu cầu `navigator.wakeLock.request('screen')` (nếu thiết bị hỗ trợ và người dùng đang để máy) kết hợp cập nhật Web Notification tiến độ từ Service Worker để hệ điều hành di động ưu tiên duy trì kết nối mạng cho tiến trình đang chạy.

### 2.2 Vượt Rào cản CORS trên GitHub Pages (`CorsFetchPipeline`)
* Vì ứng dụng được host tĩnh trên GitHub Pages, trình duyệt sẽ chặn lệnh `fetch()` trực tiếp tới các tên miền truyện bên thứ ba không bật header `Access-Control-Allow-Origin`.
* Thiết kế `CorsFetchPipeline` hỗ trợ chuỗi chuyển đổi dự phòng (Fallback Chain):
  1. Thử `fetch` trực tiếp (dành cho các nguồn mở CORS hoặc link JSON/raw).
  2. Tự động xoay vòng qua danh sách CORS Proxy cấu hình sẵn (ví dụ: `https://api.allorigins.win/raw?url=`, `https://corsproxy.io/?url=`) hoặc **Custom Cloudflare Worker Proxy URL** do người dùng cấu hình trong phần Cài đặt.
  3. Tự động giải mã bảng mã chữ Hán (`UTF-8` và cả `GBK / GB18030` thông qua `TextDecoder` chuẩn của trình duyệt vì rất nhiều web truyện Trung Quốc dùng mã `GBK`).

### 2.3 Bộ Bóc Tách Chương Tinh Giản Văn Bản Thuần & Tự Động Dò Chương Mới (`HtmlNovelExtractor` + `PlainTextSanitizer`)
* **Tinh giản hóa nội dung tuyệt đối (Plain-Text Only, Không Ảnh, Không Định Dạng):** Loại bỏ hoàn toàn mọi thẻ `<script>`, `<style>`, `<img>`, `<svg>`, `<picture>`, quảng cáo và mọi thuộc tính định dạng CSS/HTML, chỉ giữ lại tiêu đề chương thuần túy và danh sách các đoạn văn chữ Hán thuần (`plainParagraphs: string[]`).
* **Tự động tìm chương tiếp theo (`nextChapterUrl`):**
  * Quét các thẻ `<a>` có chứa từ khóa điều hướng chương tiếp theo trong tiếng Hoa (`下一章`, `下一页`, `下章`, `下一节`, hoặc thuộc tính `rel="next"`).
  * Loại bỏ các link giả (như `javascript:`, `#`, hoặc quay về trang mục lục `index.html` / `目录`) để xác định khi nào đã cào tới chương mới nhất.
* **Tự động cập nhật chương mới (Incremental Update):**
  * Lưu `lastCrawledChapterUrl` và danh sách URL các chương đã cào của từng truyện. Khi người dùng bấm **"Kiểm tra chương mới"**, hệ thống truy cập lại trang chương cuối cùng (hoặc trang mục lục gốc) để kiểm tra xem liên kết `下一章` đã trỏ sang chương mới hay chưa và tự động cào nối tiếp.

### 2.4 Quản lý "Điểm Chết" (`DeadPointCheckpoint`) và Cơ chế Cào Tiếp
* Trong bảng `crawl_jobs` của IndexedDB, mỗi tác vụ cào có trạng thái: `'idle' | 'running' | 'paused_at_deadpoint' | 'paused_by_user' | 'completed'`.
* Khi việc tải một URL chương thất bại (sau khi đã thử qua các proxy / retry ngắn) hoặc khi hệ điều hành ngắt Service Worker giữa chừng:
  * Hệ thống ghi lại đối tượng `DeadPointCheckpoint`:
    * `failedUrl`: Link chương bị kẹt.
    * `failedChapterIndex`: Số thứ tự chương đang cào dở.
    * `lastSuccessChapterUrl`: Link chương gần nhất thành công.
    * `errorReason`: Nguyên nhân thất bại.
    * `retryCount`: Số lần đã thử lại.
  * Khi người dùng bấm **"Cào tiếp từ điểm chết"** (hoặc khi Background Sync tự kích hoạt lúc có mạng lại), bộ cào bắt đầu ngay tại `deadPoint.failedUrl`, nối tiếp chỉ số chương `failedChapterIndex` vào thư mục `/books/<bookId>/` mà không cào lại các chương từ `1 .. failedChapterIndex - 1`.

### 2.5 Đóng Gói và Xuất File `.epub` Chuẩn Từ Thư Mục File Chương (`EpubExporter`)
* Sử dụng `JSZip` để đọc tuần tự từng file `/books/<bookId>/chapter-XXXX.txt` từ `BookFileSystemStore` và tạo file `.epub` văn bản thuần hợp chuẩn EPUB 2/3 ngay trên trình duyệt:
  * File `mimetype` nằm ở đầu gói ZIP với chế độ `STORE` (không nén).
  * `META-INF/container.xml` trỏ tới `OEBPS/content.opf`.
  * `OEBPS/content.opf` và `OEBPS/toc.ncx` chứa đầy đủ danh sách chương đã lưu.
  * Mỗi file chương văn bản thuần được bọc thành `OEBPS/chapter-{index}.xhtml` tối giản, không chứa ảnh hay CSS rác, thoát ký tự XML (`escapeXml`) an toàn tuyệt đối.

## 3. Hệ quả (Consequences)
* **Tích cực:** Người học có thể dán bất kỳ link truyện tiếng Hoa nào để tự động gom chương vào ứng dụng, đọc offline với bộ tra từ thông minh (từ kép, liên 3, lóng, gốc Anh), không sợ rớt mạng giữa chừng nhờ cơ chế lưu Điểm chết, và xuất ra file `.epub` bất cứ lúc nào.
* **Khả năng kiểm thử:** Toàn bộ logic bóc tách HTML, dò link `下一章`, quản lý state Điểm chết và tạo cấu trúc ZIP `.epub` đều là các module độc lập, kiểm thử đạt $\ge 90\%$ coverage dễ dàng với Vitest.
