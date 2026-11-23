# ADR-010: Extension tự tải lại trang khi bị chặn rồi tải tiếp

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-11-22
* **Liên quan đến:** [ADR-009](ADR-009-browser-assisted-capture.md) (thay thế quy tắc “gặp chặn là dừng ngay”)

## 1. Bối cảnh
Khi tải nhiều chương liên tiếp, trang nguồn (vd. hetushu sau Cloudflare) có lúc bắt đầu trả trang kiểm tra/chương rỗng cho iframe và
`fetch` của extension. Đây là phiên/cookie (vd. `cf_clearance`, cookie phiên của site) hết hạn hoặc bị đánh dấu, chứ không phải lỗi cấu trúc trang:
người dùng tải lại trang bằng tay là trình duyệt nhận phiên mới và tải tiếp được. Trước đây extension dừng ngay, người dùng phải tự tải lại rồi bấm tải tiếp.

Ràng buộc của Chrome extension: tải lại cả tab sẽ huỷ content script (mất hàng đợi, trạng thái đường nhanh), và quyền `activeTab` có thể bị thu hồi sau khi điều hướng.

## 2. Quyết định
- **Tải lại cả tab** (không chỉ iframe) khi một chương bị chặn hoặc không đọc được, để trình duyệt lấy phiên mới. Bật/tắt bằng ô
  “Tự tải lại trang khi bị chặn rồi tải tiếp” (mặc định bật, lưu trong `hn:ui.autoReload`).
- **Lượt tải là một job tuần tự hoá được** (`content.js`: `newJob/nextTask/advance`): `mode: 'list'` giữ hàng đợi chương còn lại; `mode: 'follow'`
  giữ `followUrl` + `seen`. Trước khi tải lại, job (kèm số lần tải lại, chương lỗi, trạng thái đường nhanh `fast.ok/pending/lastUrl`) được gửi cho
  `background.js`, lưu ở `chrome.storage.session` theo `tabId`, rồi `chrome.tabs.reload`.
- **Tự chèn lại**: `background.js` nghe `tabs.onUpdated (status=complete)`; tab có job → chèn lại script (kiểm tra `window.__hoanguPanel` trước để không bật/tắt panel).
  Không chèn được (mất quyền) → badge “↻” trên biểu tượng; người dùng bấm một lần, `content.js` thấy job và tải tiếp.
- **Tải tiếp**: `content.js` thấy job → dùng `job.bookKey` (không đoán lại truyện từ trang kiểm tra). Nếu tài liệu đang là trang chặn (`HNCore.isBlockedDoc`)
  thì chờ kiểm tra của site tự chạy xong (trang tự điều hướng → bản chèn mới); sau 15s báo người dùng cần thao tác; sau 3 phút bỏ job và dừng.
  Trang bình thường → xoá job ở background, chạy tiếp vòng tải từ đúng chương lỗi.
- **Chính sách** (`HNCore.reloadDecision`, `HNCore.RELOAD`): chờ lùi dần 3s → 6s → 12s… (tối đa 60s, +0–2s ngẫu nhiên) trước mỗi lần tải lại;
  tối đa 3 lần cho một chương, 30 lần cho cả lượt; chương tải được thì đếm lại từ đầu. Vượt giới hạn → dừng như cũ.
- **Đường nhanh sau tải lại**: nếu đang bật thì chương kế được kiểm chứng lại bằng cả hai đường; chương đã lưu bằng đường nhanh chưa kiểm vẫn được giữ trong `pending` để sửa nếu lệch.
- Cách tải lại đổi thành điều hướng GET tới URL sạch (không gửi lại biểu mẫu) — xem ADR-011.

## 3. Ranh giới (giữ từ ADR-009)
- Chỉ **tải lại trang trong trình duyệt thật của người dùng** — hành động người đọc vẫn làm. Kiểm tra của site chạy như bình thường.
- **Không** tự bấm/giải captcha hay Turnstile, không giả mạo fingerprint/User-Agent, không xoá cookie hay đổi danh tính để lách giới hạn.
  Kiểm tra cần người thao tác thì chờ người dùng.
- Có giới hạn số lần và thời gian chờ lùi dần để không dội tải lên site.

## 4. Hệ quả
- Tải dài không còn dừng ở lần hết phiên đầu tiên; người dùng chỉ phải can thiệp khi site đòi thao tác thật.
- Hàng chờ chọn (`s.sel`) không mang qua lần tải lại (hàng đợi đã nằm trong job).
- Cần thử thực tế trên Chrome: `activeTab` có giữ qua lần tải lại cùng origin không (nếu không, mỗi lần tải lại cần bấm biểu tượng — badge “↻”).
