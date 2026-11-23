# ADR-012: Kho truyện — trang quản lý dữ liệu truyện đã cào trong extension

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-11-23
* **Liên quan đến:** [ADR-009](ADR-009-browser-assisted-capture.md) (ranh giới: dữ liệu nằm trong `chrome.storage.local` của extension, không gọi mạng), [ADR-010](ADR-010-extension-auto-reload-on-block.md) và [ADR-011](ADR-011-extension-reload-without-form-resubmission.md) (cùng sơ đồ key `hn:*`, không đổi cách tải)

## 1. Bối cảnh
Extension lưu truyện theo sơ đồ key trong `chrome.storage.local`: meta `hn:book:*`, chương `hn:chap:*`, mục lục `hn:toc:*`, bộ đệm `hn:buf:*`, bìa `hn:cover:*`, nội dung từng chương `hn:body:*`, chỉ mục URL `hn:idx` và sổ đăng ký `hn:books`.
Trước thay đổi này, người dùng chỉ quản lý được dữ liệu ngay trong panel của từng trang truyện (“Xoá dữ liệu truyện này”, “Lọc lại nội dung”…). Hệ quả:

- Không thấy tổng quan: có bao nhiêu truyện, chiếm bao nhiêu dung lượng, truyện nào còn chương bản cào cũ.
- Không xuất được EPUB khi đang đứng ở trang khác, cũng không xuất riêng một số chương.
- Không xoá được một số chương mà không xoá cả truyện; không dọn được nội dung chương “mồ côi” (`hn:body:*` không còn chương nào trỏ tới) do các lần xoá/di trú trước để lại.

Cần một nơi tập trung, gom dữ liệu theo truyện, mà không đưa thêm máy chủ hay thay đổi cách tải.

## 2. Quyết định
1. **Trang Kho truyện** `extension/manage.html` + `manage.js` + `manage.css`, đăng ký làm `options_ui` trong `manifest.json`. Phiên bản extension `0.3.1` → `0.4.0`.
2. **Mở trang:** panel (`content.js`) có thêm biểu tượng thư viện, gửi `{type:'open:manage'}` tới `background.js`, nơi gọi `chrome.runtime.openOptionsPage()`.
3. **Hàm thuần trong `HNCore` (`extension/core.js`)**, có test trong `tests/extensionCore.test.ts`:
   - `STORE`: sơ đồ key của trang kho; phải khớp với `K` trong `content.js` (hai bản được giữ riêng, không import chung).
   - `chapterBodyKey(bookKey, c, url)`: `c.k` nếu có; bản cũ theo số thứ tự `c.n`; còn lại theo URL.
   - `orderChapters(bookKey, chap, toc)`: thứ tự mục lục (1-based), gán quyển; chương ngoài mục lục xếp sau theo thời điểm lưu; khớp URL sau khi bỏ hash.
   - `bookStorageKeys`, `pruneIndex` (không sửa đầu vào, chỉ bỏ URL trỏ về đúng truyện), `orphanBodyKeys`, `fmtBytes`.
4. **Chức năng trang:**
   - Danh sách truyện: sắp theo tên / cập nhật / dung lượng / số chương; tìm kiếm.
   - Chi tiết: ảnh bìa, thống kê, số chương bản cũ; **Xuất EPUB** cả truyện; **Gỡ ảnh bìa**; **Xoá cả truyện** (xoá `book/chap/toc/buf/cover` và mọi key nội dung chương, bỏ khỏi `hn:books`, chỉ dọn `hn:idx` của đúng truyện).
   - Bảng chương theo thứ tự mục lục: lọc, chọn, xem nội dung, **Xuất đã chọn**, **Xoá chương** (xoá key nội dung và mục trong `chap`, dọn `hn:idx`; giữ mục lục để tải lại được).
   - **Dọn chương mồ côi:** xoá `hn:body:*` không thuộc chương nào của truyện nào.
   - Tự làm mới (debounce 1,5 giây) khi `chrome.storage.onChanged` báo thay đổi khoá `hn:*` trong vùng `local`.
5. **Không thêm quyền mới** và không gọi mạng; trang đọc/ghi thẳng `chrome.storage.local`.

## 3. Ranh giới
- Chỉ thao tác trên dữ liệu extension đã lưu trong trình duyệt của người dùng. Xoá là xoá hẳn khỏi `chrome.storage.local`; file EPUB đã tải xuống không bị ảnh hưởng.
- Mọi thao tác xoá đều qua `confirm()` và ghi rõ “không hoàn tác được”. Xoá chương giữ lại mục lục để có thể tải lại.
- Không thay đổi luồng tải, luồng tự tải lại (ADR-010/011) hay định dạng dữ liệu đã lưu; trang kho chỉ đọc và ghi theo sơ đồ key sẵn có.
- Trang kho không tự sửa dữ liệu khi mở; chỉ thao tác khi người dùng bấm.

## 4. Hệ quả
- Người dùng có một chỗ thấy và dọn dữ liệu theo truyện; có thể xuất EPUB và xoá từng phần mà không cần mở đúng trang truyện.
- Dọn chương mồ côi giải phóng dung lượng mà trước đây không có cách nào xoá từ giao diện.
- Trang kho và `content.js` phải dùng cùng sơ đồ key: `STORE` (`core.js`) và `K` (`content.js`) là hai bản song song; đổi một bên mà không sửa bên kia sẽ làm kho hiển thị sai hoặc xoá nhầm.
- **Tương tác giữa panel và kho đang mở:** nếu một panel ở tab khác đang mở đúng truyện khi chương của nó bị xoá từ trang kho, khi panel đó `persistMeta` sẽ gộp chương trong bộ nhớ trở lại vào meta. Nhưng `verifyChapters` của panel sẽ loại các mục có nội dung đã mất vào lần mở panel kế tiếp; các chương đó khi ấy hiện là chưa tải và có thể tải lại. Đây là hành vi chấp nhận được nhưng chưa được kiểm chứng kỹ.
- **Chưa kiểm chứng trong Chrome thật.** Mới có test đơn vị cho các hàm thuần trong `core.js` và xem thử giao diện trên bộ nhớ giả lập (mocked `chrome.storage`). Cần thử trên Chrome thật các luồng: xuất EPUB từ trang kho, xoá chương/truyện, dọn mồ côi, tự làm mới khi panel đang tải, và biểu tượng thư viện mở đúng trang tùy chọn.
- Chưa có chức năng khôi phục sau khi xoá; dữ liệu đã xoá phải tải lại từ site.
