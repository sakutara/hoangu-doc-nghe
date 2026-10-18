# ADR-002: Kiến trúc Lưu trữ Offline và Bộ Tách Từ / Từ Điển Đa Tầng (Từ Kép, Liên 3, Tiếng Lóng, Từ Ngoại Lai)

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md)

## 1. Bối cảnh (Context)
Chữ Hán viết liền nhau không có khoảng trắng giữa các từ. Khi người học đọc truyện `.epub` hoặc bài học tiếng Hoa và chạm vào một chữ, các công cụ tra từ thô sơ thường chỉ dịch từng chữ đơn lẻ hoặc tách sai ranh giới từ. Đặc biệt, mục tiêu của người học trong ứng dụng này là đọc truyện mạng, lướt web, xem phim và chơi game nên văn bản xuất hiện rất nhiều:
* **Từ kép (2 chữ):** `注册` (đăng ký), `修炼` (tu luyện), `副本` (phó bản), `剧情` (cốt truyện).
* **Từ liên 3 (3 chữ):** `打酱油` (đi ngang qua/hóng chuyện), `破防了` (vỡ trận cảm xúc), `读卡器` (đầu đọc thẻ), `世界观` (thế giới quan).
* **Thành ngữ / cụm 4 chữ:** `莫名其妙` (không hiểu ra sao), `一本正经` (nghiêm túc đứng đắn).
* **Tiếng lóng mạng & thuật ngữ game:** `氪金` (nạp tiền), `肝` (cày cuốc), `吃瓜` (hóng drama), `开挂` (bật hack/bàn tay vàng), `满级` (max cấp).
* **Từ mượn / gốc tiếng Anh (Loanwords & Tech/Gaming terms):** `卡` (card / thẻ / bị lag), `注册` (register - đăng ký), `寄存器` (register - thanh ghi), `秀` (show - thể hiện), `粉丝` (fans - người hâm mộ), `酷` (cool - ngầu), `派对` / `趴` (party - bữa tiệc), `艾特` (at `@` - nhắc tên), `拉黑` (blacklist/block), `伏特` (volt), `逻辑` (logic).

Tất cả phải hoạt động **100% offline** mà không gọi API dịch thuật đám mây.

## 2. Quyết định (Decision)
1. **Kiến trúc Dữ liệu Từ điển Đa tầng (Multi-Layer Lexicon):**
   * Kết hợp dữ liệu từ vựng cốt lõi (CC-CEDICT chọn lọc dịch Việt + Âm Hán-Việt chuẩn) với **Bộ từ điển mở rộng chuyên biệt (Curated Slang, Web Novel, Gaming & English Loanwords Lexicon)**.
   * Mỗi mục từ lưu rõ: `simplified`, `traditional` (dự phòng), `pinyin`, `hanViet` (Âm Hán-Việt), `meanings` (danh sách nghĩa tiếng Việt), `category` (`core`, `compound`, `idiom`, `slang`, `gaming`, `loanword`), và `englishOrigin` (nếu có).
2. **Thuật toán Tách từ Ngữ cảnh (`SmartSegmenter`):**
   * Sử dụng thuật toán **Weighted Longest Prefix Match (Maximum Forward Matching kết hợp cửa sổ ngữ cảnh tại điểm chạm)**:
     * Khi tách toàn câu: Quét từ trái sang phải, ưu tiên chuỗi dài nhất có trong từ điển (tối đa 8 ký tự), có xét trọng số ưu tiên (`slang`, `loanword`, `idiom`, `compound` > từ đơn).
     * **Khi người dùng chạm vào ký tự tại vị trí `index` trong một câu:** Thuật toán quét tất cả các cửa sổ con chứa `index` (độ dài từ 8 giảm dần về 1) để tìm cụm từ có nghĩa bao phủ đúng vị trí người dùng chạm (ví dụ: câu `"我今天去注册账号"` khi chạm vào chữ `"册"` ở vị trí 5 sẽ nhận diện ngay cụm `"注册账号"` hoặc `"注册"` thay vì chỉ dịch chữ `"册"` lẻ loi).
     * Đồng thời trả về danh sách **Chi tiết từng chữ/từ thành phần (`constituents`)** để người học vừa hiểu nghĩa cả cụm (vd: `注册` = đăng ký [register]), vừa biết nghĩa từng chữ Hán-Việt (`注` = chú: ghi chép/đổ vào, `册` = sách: sổ sách/thẻ).
3. **Kiến trúc Lưu trữ Dữ liệu Người dùng (`Offline Storage Service`):**
   * Kết hợp **IndexedDB** (thông qua lớp adapter có fallback sang `localStorage`/in-memory) để lưu trữ bền vững:
     * File truyện `.epub` đã nhập và tiến độ đọc.
     * Sổ từ vựng đã lưu (`saved_words`).
     * Lịch sử thời gian học mỗi ngày (`study_sessions`) và tiến độ bài học/bài kiểm tra (`user_progress`).

## 3. Hệ quả (Consequences)
* **Tích cực:** Tốc độ tách câu và tra từ đạt $< 2\text{ms}$, hoạt động tức thì khi không có mạng, giải quyết triệt để nỗi đau của người đọc truyện/chơi game tiếng Hoa khi gặp từ ghép, tiếng lóng và từ phiên âm tiếng Anh.
* **Khả năng mở rộng:** Có thể dễ dàng bổ sung thêm các gói từ điển chuyên ngành (Tiên hiệp, Sci-fi, Công nghệ, Kinh tế) dưới dạng file JSON tĩnh hoặc nạp thêm vào IndexedDB.
