# HoaNgữ – Tải truyện (Chrome extension)

Phiên bản extension của bookmarklet trong ADR-009, bỏ giới hạn 200 chương.

## Cài đặt
`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.

## Dùng
1. Mở trang mục lục (hoặc một chương) của truyện, qua kiểm tra bot như bình thường.
2. Bấm biểu tượng extension → hiện panel.
3. **Tải mục lục** → tick các chương muốn lấy (bấm để chọn/bỏ, Shift+bấm để chọn cả dãy; hoặc nhập “Từ #/số chương” rồi **Chọn khoảng**,
   **Chọn chưa tải**, **Chọn tất cả**) → **Tải chương chưa lưu**. **Tải lại đã chọn** tải lại và ghi đè chương đã lưu.
   **Xuất đã chọn** gom riêng các chương đã tick thành một file.
   Hoặc ở trang chương bấm **Tải từ trang này (下一章)** để lần theo link chương kế.
4. Mỗi chương tải xong được lưu ngay trong kho của extension (`chrome.storage.local`, `unlimitedStorage`) — không tự tải file nào.
   Bấm **Tải xuống truyện** bất cứ lúc nào để gom *tất cả* chương đã lưu thành MỘT file `Tên.hoangu.json`. Có thể tải thêm chương
   rồi xuất lại; hủy hộp thoại tải xuống cũng không mất gì.
5. Nhập file vào app HoaNgữ (nhập lại bản mới hơn sẽ chỉ nối các chương chưa có, bỏ trùng theo URL chương).

## Chương bị mất
Nội dung mỗi chương lưu theo URL chương (không còn đánh số, nên không thể đè nhau). Nếu danh sách chương và kho không khớp
(vd. dữ liệu từ bản cũ), bấm **Khôi phục chương mất**: nhặt lại nội dung còn trong kho và bỏ dấu ✓ chương đã mất nội dung để tải lại.

## Lưu trạng thái
Theo URL mục lục của truyện: mục lục, danh sách và nội dung các chương đã lưu. Tải lại trang/đóng trình duyệt không mất; mở lại panel
là thấy dấu ✓ các chương đã lưu và tự bỏ qua chúng. “Xóa dữ liệu truyện này” mới xóa khỏi extension.

## Dừng khi gặp bot
Nghỉ 2–4 giây giữa chương. Gặp trang challenge/captcha (hoặc HTTP 403/429/503, chương rỗng) thì **dừng ngay**, các chương đã lấy vẫn nằm trong extension
và báo lại; extension không cố vượt kiểm tra. Hãy mở trang, qua kiểm tra rồi bấm tải tiếp (chương đã lưu được bỏ qua).

## Giới hạn
Mục lục phân nhiều trang chưa được gộp; bộ chọn nội dung theo heuristic như bookmarklet.
