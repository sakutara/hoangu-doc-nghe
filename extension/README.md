# HoaNgữ – Tải truyện (Chrome extension)

Tải truyện bằng chính trình duyệt của bạn (đã qua kiểm tra bot), dọn nội dung, xuất **EPUB** (có ảnh bìa). Nhập file EPUB vào app HoaNgữ ở tab Tủ truyện.

## Cài đặt
`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.

## Dùng
1. Mở trang mục lục (hoặc một chương) của truyện, qua kiểm tra bot như bình thường.
2. Bấm biểu tượng extension → hiện panel.
3. **Tải mục lục** → tick các chương muốn lấy (bấm để chọn/bỏ, Shift+bấm để chọn cả dãy; hoặc nhập “Từ #/số chương” rồi **Chọn khoảng**,
   **Chọn chưa tải**, **Chọn tất cả**) → **Tải chương chưa lưu**. **Tải lại đã chọn** tải lại và ghi đè chương đã lưu.
   Hoặc ở trang chương bấm **Tải từ trang này (下一章)** để lần theo link chương kế.
4. Mỗi chương tải xong được lưu ngay trong kho của extension (`chrome.storage.local`, `unlimitedStorage`).
   **Tải xuống EPUB** gom *tất cả* chương đã lưu thành MỘT file `Tên.epub`; **Xuất đã chọn** chỉ gom các chương đã tick.
   Có thể tải thêm chương rồi xuất lại.
5. **Tải ảnh bìa** chọn một ảnh (JPEG/PNG/GIF/WebP, ≤ 8MB) cho truyện; ảnh được dùng làm bìa của mọi EPUB xuất ra. **Gỡ bìa** để bỏ.
6. **Nhập EPUB**: đổ các chương trong một EPUB vào kho và mục lục của truyện đang mở — dùng khi truyện bị lỗi hoặc thiếu chương.
   - EPUB do extension xuất ra khớp chương theo URL gốc; EPUB khác khớp theo tiêu đề mục lục, còn lại được thêm cuối mục lục (URL tạm `epub://…`, không tải lại được từ web).
   - Chương đã có trong kho được giữ nguyên; chỉ thêm chương còn thiếu. Sau đó **Chọn chưa tải** → **Tải chương chưa lưu** để lấy phần còn thiếu, hoặc **Lọc lại nội dung đã lưu** để xử lý lại.
7. Nhập file `.epub` vào app (Tủ truyện → Chọn file .epub).

## Xử lý nội dung (tự động khi tải, nhập EPUB; hoặc bấm “Lọc lại nội dung đã lưu”)
1. Bỏ **mọi khoảng trắng** trong nội dung (kể cả dấu cách full-width, xuống dòng) — **trừ** khoảng trắng ngay sau dấu chấm, phẩy, chấm phẩy (`.` `。` `,` `，` `;` `；`) — gộp còn 1 dấu cách.
2. Rồi dọn link/watermark (so khớp sau khi “gập” chữ full-width, chữ Cyrillic giống Latin về ASCII, nên bắt được cả `ｍ•ｈｅtｕshu.cｏm.cｏm`, `ｈｔtps://ｍ•ｈｅｔｕshｕ.ｃｏm…`):
   URL `http(s)://…`, mọi “hetushu” (kèm `m.`/`www.`, dấu `•` `·`, đuôi `.com` lặp), mọi “.com” / “. com”, “www.”.
3. Bỏ tên site chữ Hán chèn giữa chữ (“老老**和图书**实实” → “老老实实”; không đụng “和图书馆/店/室/城/籍”).
4. Bỏ cụm watermark “免费在线阅读” (và “费在线阅读”); phần còn lại của dòng (tên truyện, bộ đếm…) được giữ.
5. Bỏ đoạn văn **y hệt nhau** trong cùng một chương (chỉ xét đoạn ≥ 12 ký tự, giữ lần đầu) — trang nguồn chèn đoạn lặp làm nhiễu.
6. Đoạn rỗng sau khi dọn bị bỏ. Nút “Lọc lại…” ghi đè nội dung đã lưu; sau đó xuất lại EPUB.

## Sửa tiêu đề
Bấm vào **tên truyện** (đầu panel) hoặc **tiêu đề chương** trong danh sách để sửa tại chỗ: Enter hoặc bấm ra ngoài = lưu, Esc = hủy.
Tiêu đề chương được ghi cả vào mục lục lẫn nội dung đã lưu nên EPUB xuất ra dùng tiêu đề mới. Bấm vào chỗ khác trên dòng (ô tick, số thứ tự) để chọn chương.
Tiêu đề (chương, sách, mục lục) cũng được dọn watermark như nội dung (trừ việc bỏ khoảng trắng); “Lọc lại nội dung đã lưu” dọn luôn các tiêu đề đã lưu.

## Lưu trạng thái
Theo URL mục lục của truyện: mục lục, danh sách và nội dung các chương đã lưu, ảnh bìa. Tải lại trang/đóng trình duyệt không mất; mở lại panel
là thấy dấu ✓ các chương đã lưu (được kiểm tra lại nội dung thật) và tự bỏ qua chúng. **Khôi phục chương mất** nhặt lại nội dung mồ côi;
“Xóa dữ liệu truyện này” mới xóa khỏi extension.

## Dừng khi gặp bot
Nghỉ 2–4 giây giữa chương. Gặp trang challenge/captcha (hoặc HTTP 403/429/503, chương rỗng) thì **dừng ngay**, các chương đã lấy vẫn nằm trong extension
và báo lại; extension không cố vượt kiểm tra. Hãy mở trang, qua kiểm tra rồi bấm tải tiếp (chương đã lưu được bỏ qua).

## Giới hạn
Mục lục phân nhiều trang chưa được gộp; bộ chọn nội dung theo heuristic. Việc bỏ khoảng trắng cũng làm dính các từ tiếng Anh/số trong nội dung.
