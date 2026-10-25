# HoaNgữ – Tải truyện (Chrome extension)

Phiên bản extension của bookmarklet trong ADR-009, bỏ giới hạn 200 chương.

## Cài đặt
`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.

## Dùng
1. Mở trang mục lục (hoặc một chương) của truyện, qua kiểm tra bot như bình thường.
2. Bấm biểu tượng extension → hiện panel.
3. **Tải mục lục** → bấm một chương để chọn điểm bắt đầu, nhập “số chương” (để trống = đến hết) → **Tải chương đã chọn**.
   Hoặc ở trang chương bấm **Tải từ trang này (下一章)** để lần theo link chương kế.
4. Cứ 50 chương extension tự xuất một file `Tên.phan-001.hoangu.json`, `phan-002`… (cuối lượt/khi dừng cũng xuất phần còn lại).
   Chrome có thể hỏi “cho phép tải nhiều file” một lần — hãy cho phép.
5. Nhập các file vào app HoaNgữ (cùng `bookKey` nên tự nối vào một truyện, bỏ trùng theo URL chương).

## Lưu trạng thái
Theo URL mục lục của truyện (`chrome.storage.local`, `unlimitedStorage`): mục lục, danh sách chương đã lưu (kèm file chứa chúng)
và các chương chưa xuất. Tải lại trang/đóng trình duyệt không mất; mở lại panel là thấy dấu ✓ các chương đã lưu và tự bỏ qua chúng.

## Dừng khi gặp bot
Nghỉ 2–4 giây giữa chương. Gặp trang challenge/captcha (hoặc HTTP 403/429/503, chương rỗng) thì **dừng ngay**, xuất phần đã lấy
và báo lại; extension không cố vượt kiểm tra. Hãy mở trang, qua kiểm tra rồi bấm tải tiếp (chương đã lưu được bỏ qua).

## Giới hạn
Mục lục phân nhiều trang chưa được gộp; bộ chọn nội dung theo heuristic như bookmarklet.
