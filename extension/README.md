# HoaNgữ – Tải truyện (Chrome extension)

Tải truyện bằng chính trình duyệt của bạn (đã qua kiểm tra bot), dọn nội dung, xuất **EPUB** (có ảnh bìa, nén deflate nên file nhỏ). Nhập file EPUB vào app HoaNgữ ở tab Tủ truyện.

## Cài đặt
`chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`.

## Hai tab
Panel có hai tab: **Đọc truyện** và **Tải truyện** (tab này chứa toàn bộ chức năng tải/xuất/nhập EPUB bên dưới).

### Tab Đọc truyện — đọc từ
- Công tắc **Đọc từ** bật/tắt tính năng. Khi bật, bấm vào chữ Hán bất kỳ trên trang web để hiện popup giống tính năng tra từ của app:
  phiên âm, Hán-Việt, nghĩa, loại từ, chữ thành phần, **Nghe phát âm** (giọng zh-CN của trình duyệt) và **Lưu từ**.
- Cùng bộ tra từ với app (`SmartSegmenter` + từ điển lõi + từ vựng giáo trình, đóng gói thành `dict.js`) cộng CC-CEDICT (`data/cedict.json`, nạp lần đầu khi bật).
- **Cách mở popup** (chọn ngay trong tab): *Giữ Alt + bấm* (mặc định — bấm thường không bị can thiệp nên tính năng bấm của trang như menu, lật trang vẫn dùng được; Alt = ⌥ trên Mac) hoặc *Bấm vào chữ* (mọi cú bấm vào chữ Hán đều tra, trừ link/nút/ô nhập và vùng trang có con trỏ bấm).
- Bôi đen chữ để copy không mở popup. Esc / bấm ra ngoài / cuộn trang để đóng.
- Từ đã lưu nằm trong kho của extension (không dùng chung với danh sách từ của app) và hiện ở tab này, có nút bỏ lưu.
- Công tắc chỉ áp dụng trên tab trình duyệt đang mở panel; trạng thái bật/tắt được nhớ, nhưng sang trang khác cần bấm lại biểu tượng extension để panel (và bộ đọc từ) được nạp lại.

### Giao diện (Tailwind)
Panel dùng Tailwind, biên dịch sẵn thành `panel.css` (đã commit; extension không cần build lúc chạy). Sau khi đổi class trong `content.js` hoặc `panel.src.css`:
`npm run build:extension:css`. Trong shadow DOM không dùng được các class shadow/ring của Tailwind (cần `@property`), nên bóng đổ viết tay trong `panel.src.css`.
Ảnh bìa có nút đổi/xoá ngay trên bìa (hiện khi rê chuột); dãy biểu tượng dưới thẻ truyện: làm mới mục lục, nhập EPUB, khôi phục chương mất, lọc lại nội dung, xoá dữ liệu.
Khi đang tải, chương vừa tải xong tự bỏ chọn và danh sách tự cuộn tới chương đang tải. Bấm tiêu đề quyển trong danh sách để chọn/bỏ chọn cả quyển.

## Cập nhật bộ tra từ khi app đổi từ điển
`npm run build:extension` — đóng gói lại `dict.js` từ mã của app và chép `public/cedict.json` vào `extension/data/`. (Có test kiểm tra hai bản không lệch nhau.)

## Dùng (tab Tải truyện)
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

## zhaiyuedu.com
- Trang truyện `zhaiyuedu.com/<mã>.html`, chương n: `zhaiyuedu.com/<mã>/<n>.html`. Site không có mục lục đầy đủ nên extension **dựng mục lục 1..N** với N = số chương lớn nhất tìm thấy (danh sách 最新 ở trang truyện, biến `CHAPTERS`, link 尾章). Mở trang truyện *hoặc* một chương đều được (trang chương sẽ tự tải trang truyện); tên chương là “第N章”.
- Nội dung chương nạp bằng script nên luôn tải qua iframe và đợi khối “章节内容加载中” biến mất; hết 20s vẫn chưa nạp thì dừng, không lưu rác. Các dòng menu/giới thiệu/quảng cáo/nút điều hướng của site bị lọc.
- Bản mục lục chỉ cập nhật khi bấm làm mới (site có cache, “最新” có thể trễ vài chương).

## Giới hạn
Mục lục phân nhiều trang chưa được gộp; bộ chọn nội dung theo heuristic. Việc bỏ khoảng trắng cũng làm dính các từ tiếng Anh/số trong nội dung.

## Chương lưu bằng bản cào cũ

Hetushu xáo trộn thứ tự đoạn và chèn đoạn clone ẩn; extension chỉ xử lý đúng từ khi cào bằng bản có xử lý này (chờ script của trang chạy xong, bỏ thẻ ẩn, tự giải mã khóa khi cần). Mỗi chương lưu mới được đánh dấu phiên bản; chương lưu trước đó hiện **△** thay vì ✓ và **không thể sửa từ dữ liệu đã lưu** (khóa sắp xếp không được lưu, không phân biệt được đoạn thật/clone). Bấm **Chọn chương bản cũ** → **Tải lại đã chọn** để cào lại chúng.
