# ADR-011: Extension mở lại trang bằng điều hướng GET (không gửi lại biểu mẫu) và tự chọn chương chưa tải

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-11-23
* **Liên quan đến:** [ADR-010](ADR-010-extension-auto-reload-on-block.md) (đổi cách tải lại trang ở nhánh `job:reload`), [ADR-009](ADR-009-browser-assisted-capture.md) (ranh giới không đổi)

## 1. Bối cảnh
Sau khi qua kiểm tra Cloudflare trên hetushu, trình duyệt gửi **POST** về URL chương (thường kèm query `__cf_chl_*`). Trang đang hiển thị là kết quả của
POST, nên `chrome.tabs.reload(tabId)` (ADR-010) khiến Chrome bật hộp thoại gốc **“Confirm Form Resubmission”**. Hộp thoại này nằm ngoài trang nên
extension không bấm được → lượt tải kẹt, không tự tiếp tục được.

Ngoài ra, trang có thể gắn `beforeunload` (“Leave site?”), làm điều hướng cũng bị chặn nếu không gỡ.

Song song, người dùng phải tự tick từng nhóm chương mỗi lần mở panel để tải phần còn thiếu; mục tiêu là panel tự chọn sẵn các chương chưa tải.

## 2. Quyết định
1. **Mở lại bằng điều hướng GET tới URL sạch** thay vì `chrome.tabs.reload`:
   - `HNCore.reloadUrl(href)` (`extension/core.js`) trả URL bỏ hash và mọi param `__cf_chl_*`, giữ nguyên các param khác và thứ tự; không parse được hoặc không phải http/https → `null`.
   - `content.js` (`reloadForSession`) gửi kèm `url: job.reloadUrl` trong `job:reload`.
   - `background.js` (`job:reload`): lưu job vào `chrome.storage.session` như cũ; gỡ `window.onbeforeunload` (world MAIN, lỗi bỏ qua); nếu URL qua `safeTarget` (http/https và cùng origin với `sender.url` hoặc `sender.tab.url`) thì `chrome.tabs.update(tabId, { url })`, ngược lại fallback `chrome.tabs.reload(tabId, { bypassCache: false })`.
   - Điều hướng mới là GET nên không gửi lại form POST và không có hộp thoại.
2. **Tự chọn chương chưa tải** mỗi khi panel nạp (kể cả sau khi tự tải lại):
   - `selectUnsaved()` tick mọi chương chưa lưu, bỏ chương nhập từ EPUB (`epub://`). Nút chip “Chưa tải” dùng cùng hàm.
   - `init()` gọi `selectUnsaved()`; khi không có job, thêm vào dòng trạng thái “Đã tự chọn N chương chưa tải — bấm tải để bắt đầu.”. Có job thì vẫn chọn nhưng không ghi đè dòng trạng thái của lượt tải.
   - Không tự bắt đầu tải khi không có job.
3. Phiên bản extension `0.3.0` → `0.3.1`.

## 3. Ranh giới (giữ từ ADR-009/010)
- Vẫn chỉ mở lại trang trong trình duyệt thật của người dùng; kiểm tra của site chạy như bình thường.
- **Không** bấm captcha, không giả mạo danh tính, không xoá cookie. Điều hướng chỉ tới URL cùng origin với trang hiện tại.
- Giới hạn số lần và thời gian chờ lùi dần của ADR-010 không đổi.

## 4. Hệ quả
- Không còn hộp thoại “gửi lại biểu mẫu” khi tải lại; trang sạch được mở bằng GET.
- Chương có `__cf_chl_*` trên URL sẽ được mở lại không kèm token đó; chỉ có tác dụng nếu site không cần token ấy để cấp phiên.
- Cần thử thực tế trên Chrome: điều hướng tới cùng URL có còn hộp thoại nào không, và `activeTab` có giữ qua điều hướng cùng origin không. Nếu vẫn còn hộp thoại hoặc trang trả về kết quả POST, phương án dự phòng là mở lại URL mục lục (`job` đã biết) thay vì URL chương.
- Chưa kiểm chứng bằng trình duyệt thật trong thay đổi này; mới có test cho `reloadUrl` (`tests/extensionCore.test.ts`).
