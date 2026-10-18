# Business Requirement — EPIC-05: Tự Động Cào Truyện Online Ngầm (Service Worker), Lưu Điểm Chết & Xuất File EPUB

* **Mã Epic:** EPIC-05
* **Tên Epic:** Service Worker Web Novel Crawler, Dead-Point Resume & EPUB Exporter
* **Trạng thái:** Chờ duyệt (Pending User Review)
* **Liên kết Tài liệu Chung:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md) | [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md) | [ADR-005](file:///Users/sakutara/Work/chinese-study/docs/adr/ADR-005-service-worker-novel-crawler-and-epub-export.md)

---

## 1. Mục tiêu Nghiệp vụ (Business Objective)
Cho phép người học tự động tải (cào) bất kỳ bộ truyện chữ tiếng Hoa online nào về cơ sở dữ liệu offline (`IndexedDB`) chỉ bằng một đường link được gửi vào ứng dụng. Tiến trình cào phải:
1. **Chạy ngầm bằng Service Worker** để tiếp tục hoạt động ngay cả khi điện thoại tắt màn hình hoặc chuyển ứng dụng.
2. **Tự động phát hiện và nạp chương mới** (`下一章` / mục lục) để cào nối tiếp.
3. **Lưu và nhớ chính xác "Điểm chết" (`Dead-Point Checkpoint`)** khi có chương cào thất bại và cho phép cào tiếp từ đúng điểm chết đó.
4. **Đóng gói nội dung đã cào trong DB thành file `.epub` chuẩn** để người dùng tải xuống thiết bị bất cứ lúc nào, đồng thời đọc trực tiếp trong trình đọc thông minh của ứng dụng.

---

## 2. Danh sách Yêu cầu Nghiệp vụ Chi tiết (User Stories & Functional Requirements)

### FR-05.1: Gửi Link Cào Truyện Tinh Giản (Chỉ Lưu Văn Bản Thuần) & Lưu Theo Từng File Chương
* **Mô tả:** Người dùng dán URL của một chương truyện hoặc trang mục lục truyện tiếng Hoa vào ô nhập link và bấm **"Bắt đầu cào"**.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-5.1.1:** Hệ thống hỗ trợ nhập URL bắt đầu cào, tên truyện tùy chọn (hoặc tự động bóc tách từ trang web), giới hạn số chương cào mỗi đợt (hoặc cào tới chương mới nhất), và cấu hình CORS Proxy (mặc định có sẵn danh sách proxy dự phòng + cho phép nhập proxy riêng).
  * **AC-5.1.2 (Tinh giản hóa nội dung — Không ảnh, Không định dạng):** Mỗi chương cào về được lọc qua `PlainTextSanitizer` để loại bỏ 100% hình ảnh (`<img>`, `<svg>`), quảng cáo và mọi định dạng HTML/CSS, tự động chuyển đổi bảng mã (`UTF-8` / `GBK`) và chỉ giữ lại tiêu đề chương + các đoạn văn bản thuần.
  * **AC-5.1.3 (Lưu 1 thư mục / 1 truyện, 1 file / 1 chương để tránh ngốn RAM):** Nội dung từng chương cào thành công được ghi thành 1 file văn bản riêng biệt `/books/<bookId>/chapter-XXXX.txt` trên File System (OPFS), còn `IndexedDB` chỉ lưu Metadata nhẹ của truyện.
  * **AC-5.1.4:** Truyện đã cào xuất hiện ngay trong trang **Quản lý Tủ Truyện** để người học mở ra đọc (lazy-load từng chương), dịch sang tiếng Việt, tải xuống `.epub` hoặc xóa toàn bộ thư mục truyện.

### FR-05.2: Chạy Ngầm Bằng Service Worker Kể Cả Khi Tắt Màn Hình Điện Thoại
* **Mô tả:** Người dùng bắt đầu cào một bộ truyện dài trên điện thoại rồi tắt màn hình hoặc chuyển sang màn hình khóa, tiến trình cào vẫn tiếp tục chạy.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-5.2.1:** Tác vụ cào được điều phối và thực thi bên trong **Custom Service Worker** (`src/sw/custom-sw.ts`), kết hợp `Background Sync API`, `ExtendableEvent.waitUntil()` và tùy chọn giữ thức màn hình (`Screen Wake Lock API`) khi cần tải tốc độ cao.
  * **AC-5.2.2:** Service Worker ghi trực tiếp từng chương đã tải ra file `/books/<bookId>/chapter-XXXX.txt` và cập nhật trạng thái vào `IndexedDB` mà không phụ thuộc vào việc tab giao diện React còn đang hiển thị hay đã ẩn dưới nền.
  * **AC-5.2.3:** Khi người dùng mở sáng màn hình lại, giao diện tự động đồng bộ tiến độ mới nhất từ Service Worker / IndexedDB (số chương đã cào, chương hiện tại, trạng thái đang chạy hoặc điểm chết).

### FR-05.3: Tự Động Phát Hiện & Tải Chương Mới (Auto-Load Next & New Chapters)
* **Mô tả:** Hệ thống tự động tìm đường dẫn chương kế tiếp để cào liên tục và có khả năng kiểm tra/cào thêm các chương mới xuất bản sau này.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-5.3.1 (Tự động chuyển chương kế tiếp):** Sau khi tải xong chương $k$, bộ bóc tách tự động tìm liên kết chương $k+1$ thông qua các mẫu nhận diện chuẩn của web truyện tiếng Hoa (`下一章`, `下一页`, `下章`, `下一节`, `rel="next"`) hoặc danh sách chương trong mục lục (TOC).
  * **AC-5.3.2 (Tự động tải chương mới phát hành):** Đối với truyện đã cào đến chương cuối cùng trước đó, người dùng có thể bấm **"Kiểm tra & Cào chương mới"**. Hệ thống sẽ kiểm tra lại từ chương cuối cùng hoặc trang mục lục để tự động tải tiếp các chương mới cập nhật vào DB.

### FR-05.4: Lưu & Nhớ "Điểm Chết" (Dead-Point Checkpoint) và Cào Tiếp Từ Điểm Đó
* **Mô tả:** Nếu quá trình cào bị đứt quãng tại một chương nào đó (do mất mạng, lỗi trang nguồn, timeout, chặn tần suất request, hoặc hệ điều hành dừng tiến trình ngầm), ứng dụng phải nhớ chính xác vị trí bị lỗi.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-5.4.1:** Khi một chương bị lỗi sau khi đã thử lại (retry), hệ thống chuyển trạng thái tác vụ sang `Tạm dừng tại Điểm Chết (Paused at Dead-Point)` và lưu bền vững thông tin **Điểm chết (`DeadPointCheckpoint`)** vào IndexedDB:
    * URL của chương bị lỗi (`failedUrl`)
    * Số thứ tự chương bị lỗi (`failedChapterIndex`)
    * URL của chương cuối cùng cào thành công (`lastSuccessChapterUrl`)
    * Lý do thất bại (`errorReason`) & thời gian xảy ra lỗi (`failedAt`)
  * **AC-5.4.2:** Toàn bộ các chương đã cào thành công trước điểm chết vẫn được bảo toàn nguyên vẹn trong DB để đọc bình thường.
  * **AC-5.4.3:** Khi người dùng bấm nút **"Cào tiếp từ Điểm Chết"** (hoặc sửa đổi proxy/chờ mạng ổn định rồi bấm tiếp tục), Service Worker nối lại quá trình cào bắt đầu **đúng từ `failedUrl` (`failedChapterIndex`)** và tiếp tục cào các chương tiếp theo mà không phải cào lại các chương cũ.

### FR-05.5: Xuất và Tải Nội Dung Đã Cào Thành File `.epub`
* **Mô tả:** Người dùng có thể tải bất kỳ bộ truyện nào đã cào trong DB về thiết bị dưới dạng file `.epub` tiêu chuẩn.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-5.5.1:** Có nút **"Tải xuống EPUB (`.epub`)"** trên mỗi bộ truyện đã cào (hỗ trợ xuất cả khi bộ truyện đã cào xong hoặc đang tạm dừng ở một điểm chết).
  * **AC-5.5.2:** File `.epub` xuất ra tuân thủ đúng chuẩn định dạng EPUB (chứa `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, và các file chương `OEBPS/chapter-*.xhtml` mã hóa UTF-8 sạch sẽ).
  * **AC-5.5.3:** File `.epub` tải về máy có thể mở đọc mượt mà trên mọi phần mềm đọc sách (Apple Books, Google Play Books, Calibre, KOReader) cũng như nhập ngược lại vào trình đọc EPUB của chính ứng dụng.

---

## 3. Tiêu chuẩn Chất lượng & Kiểm thử (Quality & Coverage Requirements)
* Toàn bộ mã nguồn của Epic 5 (Bộ bóc tách HTML & tự tìm chương mới, Quản lý Điểm chết & Resume, Bridge giao tiếp Service Worker, và Bộ đóng gói xuất file `.epub`) phải đạt **$\ge 90\%$ test coverage** trên cả 4 chỉ số (`lines`, `statements`, `functions`, `branches`).
