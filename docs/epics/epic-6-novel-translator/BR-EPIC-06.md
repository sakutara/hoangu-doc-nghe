# Business Requirement — EPIC-06: Dịch Truyện Chạy Ngầm (Tiếng Hoa $\rightarrow$ Tiếng Việt) bằng Service Worker & Phục Hồi Điểm Chết

* **Mã Epic:** EPIC-06
* **Tên Epic:** Service Worker Background Novel Translator (ZH $\rightarrow$ VI) & Dead-Point Resume
* **Trạng thái:** Chờ duyệt (Pending User Review)
* **Liên kết Tài liệu Chung:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md) | [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md) | [ADR-006](file:///Users/sakutara/Work/chinese-study/docs/adr/ADR-006-opfs-chapter-file-storage-and-background-novel-translator.md)

---

## 1. Mục tiêu Nghiệp vụ (Business Objective)
Cung cấp tính năng **Dịch Truyện Tự Động (Chinese $\rightarrow$ Vietnamese)** cho phép người dùng chọn một bộ truyện tiếng Hoa có sẵn trong ứng dụng (từ upload `.epub` hoặc từ cào online) để dịch thành một **bộ truyện tiếng Việt hoàn chỉnh**:
1. Bộ truyện tiếng Việt có **tiêu đề tiếng Việt**, được lưu trữ quản lý trong DB và nằm trong danh sách truyện của app.
2. Nội dung từng chương dịch được lưu thành **từng file văn bản thuần riêng biệt** trong thư mục riêng của bộ truyện tiếng Việt (`/books/<viBookId>/chapter-XXXX.txt`) để không ngốn RAM.
3. Quá trình dịch **chạy ngầm bằng Service Worker** (hoạt động liên tục kể cả khi tắt màn hình điện thoại) và **nhớ chính xác "Điểm chết" (`TranslationDeadPointCheckpoint`)** để chạy tiếp từ chương bị lỗi tương tự như thao tác cào truyện.

---

## 2. Danh sách Yêu cầu Nghiệp vụ Chi tiết (User Stories & Functional Requirements)

### FR-06.1: Khởi Tạo Bộ Truyện Dịch Tiếng Việt Có Tiêu Đề Tiếng Việt
* **Mô tả:** Tại trang Quản lý Tủ Truyện, người dùng bấm nút **"Dịch sang Tiếng Việt"** trên một bộ truyện tiếng Hoa có sẵn trong DB.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-6.1.1:** Hệ thống tự động dịch tiêu đề truyện tiếng Hoa sang **Tiêu đề tiếng Việt** (hoặc cho phép người dùng chỉnh sửa tên tiếng Việt trước khi bắt đầu) và tạo một bộ truyện mới trong DB với ngôn ngữ `language = 'vi'`, liên kết `sourceBookId` tới bộ truyện tiếng Hoa gốc.
  * **AC-6.1.2:** Tạo thư mục lưu trữ riêng `/books/<viBookId>/` trên File System để chứa các file chương tiếng Việt (`chapter-0001.txt`, `chapter-0002.txt`...).
  * **AC-6.1.3:** Bộ truyện tiếng Việt xuất hiện ngay trong trang **Quản lý Danh sách Truyện**, có thể mở đọc những chương đã dịch xong, tải xuống thành file `.epub` tiếng Việt, hoặc xóa khỏi app bất cứ lúc nào.

### FR-06.2: Dịch Từng Chương Chạy Ngầm Bằng Service Worker (Không Ngốn RAM)
* **Mô tả:** Tiến trình dịch chạy ngầm trong Service Worker để dịch lần lượt từng chương của bộ truyện gốc sang bộ truyện tiếng Việt.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-6.2.1 (Chạy ngầm khi tắt màn hình):** Tác vụ dịch chạy bên trong **Custom Service Worker** kết hợp `Background Sync` và `ExtendableEvent.waitUntil()`, tiếp tục dịch các chương ngay cả khi điện thoại tắt màn hình.
  * **AC-6.2.2 (Xử lý theo từng file chương — Tối ưu RAM):** Ở mỗi bước dịch chương thứ $k$, Service Worker chỉ đọc đúng 1 file `/books/<sourceBookId>/chapter-kkkk.txt` lên RAM, dịch tiêu đề chương và các đoạn văn sang tiếng Việt, ghi kết quả ra file `/books/<viBookId>/chapter-kkkk.txt`, cập nhật tiến độ vào DB rồi giải phóng bộ nhớ chương $k$ ngay lập tức.
  * **AC-6.2.3 (Chế độ dịch linh hoạt):** Hỗ trợ bộ dịch **Offline Smart Phrase / Hán-Việt & Nghĩa Việt** (chạy 100% không cần mạng, tự động ghép nghĩa từ kép, từ liên 3, thành ngữ, tiếng lóng, từ gốc Anh thành câu tiếng Việt dễ hiểu) **và** tùy chọn kết nối API dịch thuật online khi có mạng.

### FR-06.3: Lưu & Nhớ "Điểm Chết Dịch Thuật" và Chạy Tiếp Sau Khi Fail
* **Mô tả:** Khi quá trình dịch gặp lỗi tại một chương bất kỳ (mất mạng khi dùng dịch online, rate-limit, lỗi đọc/ghi file, hoặc hệ điều hành ngắt Service Worker), ứng dụng lưu lại điểm chết và cho phép dịch tiếp từ đúng chương đó.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-6.3.1:** Khi dịch chương thứ $k$ thất bại, hệ thống chuyển trạng thái `TranslationJob` sang `'paused_at_deadpoint'` và lưu bền vững thông tin `TranslationDeadPointCheckpoint` vào DB:
    * `failedChapterIndex`: Số thứ tự chương bị lỗi ($k$).
    * `lastTranslatedChapterIndex`: Chương cuối cùng đã dịch thành công ($k-1$).
    * `errorReason`: Nguyên nhân lỗi.
    * `failedAt` & `retryCount`.
  * **AC-6.3.2:** Khi người dùng bấm **"Dịch tiếp từ điểm chết"** (hoặc khi Background Sync tự kích hoạt), hệ thống đọc tiếp từ file chương $k$ của truyện gốc để dịch tiếp từ chương $k$ trở đi, giữ nguyên toàn bộ các file chương $1 \dots k-1$ đã dịch trước đó.
  * **AC-6.3.3 (Tự động dịch nối tiếp khi truyện gốc cào thêm chương mới):** Nếu bộ truyện tiếng Hoa gốc được cào thêm các chương mới ($N+1 \dots M$), người dùng có thể bấm **"Dịch thêm chương mới"** trên bộ truyện tiếng Việt để tự động dịch tiếp từ chương $N+1$ đến $M$.

---

## 3. Tiêu chuẩn Chất lượng & Kiểm thử (Quality & Coverage Requirements)
* Toàn bộ mã nguồn của Epic 6 (`ChineseToVietNovelTranslator`, `NovelTranslationRunner`, `TranslationDeadPointCheckpoint`) phải đạt **$\ge 90\%$ test coverage** trên cả 4 chỉ số (`lines`, `statements`, `functions`, `branches`).
