# Business Requirement — EPIC-04: Upload EPUB Tinh Giản, Đọc Truyện Lazy-Load Theo Chương & Quản Lý Tủ Truyện (Xóa Truyện)

* **Mã Epic:** EPIC-04
* **Tên Epic:** Plain-Text EPUB Upload, Lazy-Loaded Chapter Reader & Book Library Manager
* **Trạng thái:** Chờ duyệt (Pending User Review)
* **Liên kết Tài liệu Chung:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md) | [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md) | [ADR-006](file:///Users/sakutara/Work/chinese-study/docs/adr/ADR-006-opfs-chapter-file-storage-and-background-novel-translator.md)

---

## 1. Mục tiêu Nghiệp vụ (Business Objective)
Cung cấp hệ thống quản lý tủ sách và trình đọc truyện tối ưu hóa bộ nhớ tuyệt đối cho thiết bị di động:
1. **Không ngốn RAM khi load truyện:** Lưu trữ nội dung truyện trên hệ thống file cục bộ theo cấu trúc **1 truyện = 1 thư mục (`/books/<bookId>/`)** và **1 chương = 1 file (`chapter-XXXX.txt`)**. Khi đọc chỉ load đúng 1 chương đang xem lên RAM.
2. **Tinh giản hóa nội dung khi Upload `.epub`:** Chỉ lưu văn bản thuần (Plain Text), loại bỏ 100% hình ảnh và định dạng CSS/HTML.
3. **Trang Quản lý Danh sách Truyện & Xóa Truyện Triệt để:** Cho phép xem danh sách tất cả các bộ truyện trong app (tiếng Hoa & tiếng Việt) và xóa hoàn toàn bất kỳ bộ truyện nào (xóa sạch toàn bộ thư mục file chương và metadata trong DB).

---

## 2. Danh sách Yêu cầu Nghiệp vụ Chi tiết (User Stories & Functional Requirements)

### FR-04.1: Tinh Giản Hóa Khi Upload File `.epub` & Lưu Theo Từng File Chương
* **Mô tả:** Người dùng chọn một file `.epub` từ thiết bị để thêm vào ứng dụng.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-4.1.1 (Chỉ lưu nội dung chữ, không ảnh, không định dạng):** Khi giải nén file `.epub`, hệ thống bỏ qua toàn bộ các file ảnh (`.jpg`, `.png`, `.webp`, `.gif`, `.svg`), bỏ qua file `.css`/font, và lọc bỏ mọi thẻ định dạng HTML trong từng chương để chỉ lấy **tiêu đề chương thuần** và **các đoạn văn bản thuần (`plainParagraphs`)**.
  * **AC-4.1.2 (Lưu 1 thư mục / 1 truyện, 1 file / 1 chương):** Tạo thư mục `/books/<bookId>/` trên File System (OPFS) và ghi từng chương thành các file riêng lẻ `chapter-0001.txt`, `chapter-0002.txt`... Trong DB (`books_metadata`) chỉ lưu thông tin chung và danh sách tên chương.

### FR-04.2: Trình Đọc Truyện Lazy-Load Từng Chương & Dịch Chạm Thông Minh
* **Mô tả:** Người học mở một bộ truyện từ tủ sách để đọc và tra từ chạm.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-4.2.1 (Chống quá tải RAM):** Khi mở truyện ở chương $k$, ứng dụng chỉ đọc duy nhất file `/books/<bookId>/chapter-kkkk.txt` từ đĩa lên RAM. Khi chuyển sang chương $k+1$, nội dung chương $k$ trên RAM được giải phóng ngay.
  * **AC-4.2.2 (Tích hợp Dịch chạm thông minh cho truyện tiếng Hoa):** Chạm vào bất kỳ chữ nào trong chương truyện tiếng Hoa sẽ nhận diện từ ghép/từ liên 3/tiếng lóng/từ gốc Anh và hiển thị Popover Hán - Pinyin - Hán Việt - Việt kèm phát âm TTS và nút Lưu từ.
  * **AC-4.2.3 (Hỗ trợ đọc cả truyện dịch tiếng Việt):** Đối với bộ truyện tiếng Việt (do tính năng Dịch truyện tạo ra), trình đọc hiển thị văn bản tiếng Việt mượt mà và cho phép chuyển đổi nhanh sang chương tương ứng của bộ truyện gốc tiếng Hoa để đối chiếu.

### FR-04.3: Trang Quản Lý Danh Sách Các Bộ Truyện & Xóa Truyện Khỏi App
* **Mô tả:** Người dùng truy cập trang **Quản lý Tủ Truyện** để kiểm soát toàn bộ các bộ truyện trong ứng dụng.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-4.3.1:** Hiển thị danh sách tất cả các bộ truyện hiện có trong DB (truyện mẫu, truyện upload `.epub`, truyện cào online tiếng Hoa, và truyện đã dịch sang tiếng Việt) kèm thông tin: Tên truyện, Ngôn ngữ (`Tiếng Hoa 简体` / `Tiếng Việt`), Nguồn, Số chương hiện có, Trạng thái cào/dịch.
  * **AC-4.3.2 (Xóa truyện triệt để):** Mỗi bộ truyện có nút **"Xóa truyện"**. Khi người dùng xác nhận xóa:
    1. Dừng ngay mọi tiến trình cào hoặc dịch chạy ngầm liên quan đến bộ truyện đó (nếu có).
    2. Xóa hoàn toàn thư mục `/books/<bookId>/` và **toàn bộ các file chương** của bộ truyện trên File System.
    3. Xóa sạch bản ghi metadata và trạng thái job của truyện khỏi Database (`IndexedDB`).

---

## 3. Tiêu chuẩn Chất lượng & Kiểm thử (Quality & Coverage Requirements)
* Toàn bộ mã nguồn của Epic 4 (`PlainTextSanitizer`, `BookFileSystemStore`, `EpubPlainImporter`, `LazyChapterReader`, `BookLibraryManager`) phải đạt **$\ge 90\%$ test coverage**.
