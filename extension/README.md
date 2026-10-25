# HoaNgữ – Tải truyện (Chrome extension)

Phiên bản extension của bookmarklet trong ADR-009, bỏ giới hạn 200 chương.

## Cài đặt
`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.

## Dùng
1. Mở trang mục lục (hoặc một chương) của truyện, qua kiểm tra bot như bình thường.
2. Bấm biểu tượng extension → hiện panel.
3. **Tải mục lục** → bấm một chương để chọn điểm bắt đầu, nhập “số chương” (để trống = đến hết) → **Tải chương đã chọn**.
   Hoặc ở trang chương bấm **Tải từ trang này (下一章)** để lần theo link chương kế.
4. Mỗi chương tải xong được lưu ngay trong kho của extension (`chrome.storage.local`, `unlimitedStorage`) — không tự tải file nào.
   Bấm **Tải xuống truyện** bất cứ lúc nào để gom *tất cả* chương đã lưu thành MỘT file `Tên.hoangu.json`. Có thể tải thêm chương
   rồi xuất lại; hủy hộp thoại tải xuống cũng không mất gì.
5. Nhập file vào app HoaNgữ (nhập lại bản mới hơn sẽ chỉ nối các chương chưa có, bỏ trùng theo URL chương).

## Lưu trạng thái
Theo URL mục lục của truyện: mục lục, danh sách và nội dung các chương đã lưu. Tải lại trang/đóng trình duyệt không mất; mở lại panel
là thấy dấu ✓ các chương đã lưu và tự bỏ qua chúng. “Xóa dữ liệu truyện này” mới xóa khỏi extension.

## Dừng khi gặp bot
Nghỉ 2–4 giây giữa chương. Gặp trang challenge/captcha (hoặc HTTP 403/429/503, chương rỗng) thì **dừng ngay**, các chương đã lấy vẫn nằm trong extension
và báo lại; extension không cố vượt kiểm tra. Hãy mở trang, qua kiểm tra rồi bấm tải tiếp (chương đã lưu được bỏ qua).

## Giới hạn
Mục lục phân nhiều trang chưa được gộp; bộ chọn nội dung theo heuristic như bookmarklet.
