# Business Requirement — EPIC-02: Giáo trình 4 cấp độ, Bài học Đọc-Nghe & Bài kiểm tra Mở khóa Tiến độ

* **Mã Epic:** EPIC-02
* **Trạng thái:** Đã triển khai (Implemented) — nội dung mở rộng lần 2 (≈ 6.600 từ, 266 bài)
* **Liên kết:** [BR-MASTER](../../BR-MASTER.md) (Trụ cột 2) | [SA-EPIC-02](SA-EPIC-02.md) | [ADR-008](../../adr/ADR-008-curriculum-scale-and-data-pipeline.md)

## 1. Mục tiêu
Cho người học lộ trình từ sơ cấp đến đọc truyện/web/phim/game thực chiến, **chỉ luyện Đọc và Nghe** (không tập viết nét, không chấm phát âm), có bài kiểm tra để mở khóa bài kế tiếp.

**Mục tiêu đo được:** người học hoàn thành toàn bộ giáo trình thì đã gặp **≥ 90% số từ** thường xuất hiện khi đọc truyện mạng, lướt web và xem phim, đủ để đọc trơn tru bằng dịch chạm thông minh của Epic 1 mà không phải tra từ liên tục.

## 2. Yêu cầu chức năng
### FR-02.1 Cấu trúc giáo trình
* **AC-1.1:** 4 cấp độ đúng BR-MASTER §3.2: (1) Nền tảng & Hán-Việt cốt lõi; (2) Giao tiếp phim ảnh & lướt web; (3) Ngôn ngữ tiểu thuyết mạng & game; (4) Thành ngữ, lóng hiện đại & đọc đoạn dài.
* **AC-1.2:** Mỗi cấp gồm nhiều bài; mỗi bài có: từ vựng trọng tâm (chữ Hán, pinyin, Hán-Việt, nghĩa Việt), đoạn hội thoại/văn bản ngắn, bài kiểm tra.
* **AC-1.3 (quy mô):** Toàn giáo trình **≥ 250 bài, ≥ 6.000 từ vựng** (hiện: 266 bài, 6.581 từ, 2.262 chữ Hán, 1.128 câu có dịch). Mỗi cấp ≥ 50 bài; mỗi bài khoảng 25 từ (bài chủ đề đặc biệt có thể 14–30 từ) và 3–6 câu.
* **AC-1.4 (thành phần từ vựng):**
  * Cấp 1 (60 bài, 1.500 từ) và Cấp 2 (72 bài, 1.798 từ): từ phổ biến nhất trong hội thoại phim/web, xếp theo tần suất.
  * Cấp 3 (79 bài, 1.933 từ): 28 bài ngôn ngữ truyện mạng — tu tiên (cảnh giới, tông môn, pháp bảo, đan dược, yêu ma, thần thông, thiên kiếp), võ hiệp, cung đình, đời thường cổ đại, đô thị/tổng tài, xuyên không/hệ thống, game, vai trò nhân vật, trạng từ & động tác trong văn truyện, cảnh vật, y phục cổ, đấu giá, quân sự, thời gian ước lượng, lượng từ, xưng hô cổ, tính cách, thuật ngữ thể loại — và 51 bài từ vựng tần suất tiếp theo.
  * Cấp 4 (55 bài, 1.350 từ): 14 bài thành ngữ 4 chữ (cảm xúc, chiến đấu, tình nghĩa, tính cách, thành bại, vẻ đẹp & cảnh sắc, tài trí, huyền huyễn, điển tích, hành xử, số lượng, tình huống khó xử…), 7 bài tiếng lóng hiện đại, 2 bài từ ghép/cấu trúc láy thường gặp, 32 bài **đoạn đọc** (mỗi bài một đoạn văn 6 câu liền mạch dùng chính từ của bài).
* **AC-1.5 (Hán-Việt & nghĩa):** Mọi từ đều có pinyin có dấu, âm Hán-Việt theo từng chữ (đúng âm đọc theo pinyin của từ) và nghĩa Việt ngắn gọn; **nghĩa Việt không trùng nhau giữa hai từ bất kỳ** để câu "Việt → Hán" luôn có đúng một đáp án.
### FR-02.2 Học bài
* **AC-2.1:** Từ vựng có nút nghe mẫu (TTS `zh-CN`).
* **AC-2.2:** Đoạn đọc/nghe dùng lại **dịch chạm thông minh** của Epic 1; có nút nghe từng câu và hiện/ẩn bản dịch Việt. Mọi từ trong câu ví dụ đều tra được.
### FR-02.3 Bài kiểm tra
* **AC-3.1:** Bài kiểm tra **chỉ kiểm tra chữ Hán và nghĩa tiếng Việt**; **không** kiểm tra pinyin hay âm Hán-Việt (hai thông tin này vẫn hiển thị ở phần học để tham khảo). Bốn dạng câu hỏi: **Nghe chọn nghĩa Việt**, **Hán → Việt** (hiện chữ Hán, chọn nghĩa Việt), **Việt → Hán** (hiện nghĩa Việt, chọn chữ Hán), **Đọc câu chọn bản dịch Việt**. **Mỗi lần làm bài lấy ngẫu nhiên 12 câu** từ kiến thức của bài (tối đa 2 câu đọc, còn lại là từ vựng; dạng câu hỏi của từ cũng ngẫu nhiên), **ưu tiên các mục chưa ra ở những lần trước** — bấm Làm lại sẽ ra bộ câu khác, chỉ lặp lại khi đã ra hết mọi mục của bài (khi đó bắt đầu vòng mới).
* **AC-3.2:** Mỗi câu 4 đáp án, thứ tự xáo trộn; hiển thị đúng/sai ngay sau khi chọn. Đáp án sai ưu tiên lấy **từ chính bài đó**, thiếu mới bổ sung từ các bài khác **cùng cấp**.
* **AC-3.3:** Đạt **≥ 80%** thì bài được đánh dấu hoàn thành và **mở khóa bài kế tiếp**; chưa đạt cho làm lại. Lưu điểm cao nhất.
### FR-02.4 Tiến độ
* **AC-4.1:** Chỉ bài đầu tiên mở sẵn; bài khác khóa tới khi bài trước đạt chuẩn (xuyên suốt 4 cấp).
* **AC-4.2:** Hiển thị % hoàn thành giáo trình và điểm tốt nhất từng bài; lưu offline.
* **AC-4.3:** Thời gian học trên trang bài học được tính vào mục tiêu 30 phút/ngày (bộ đếm toàn cục của Epic 1).
* **AC-4.4 (danh sách bài dài):** Trang Giáo trình gom bài theo cấp thành các nhóm thu gọn được, mở sẵn cấp đang học, ghi `x/y bài` đã xong mỗi cấp và tổng số bài/số từ; trang Tiến độ cũng thu gọn theo cấp.
### FR-02.5 Độ phủ từ vựng (yêu cầu nội dung)
* **AC-5.1:** Trên kho tần suất phụ đề phim SUBTLEX-CH (≈ 33,2 triệu lượt từ Hán, đã loại tên riêng/ký hiệu), giáo trình phủ **≥ 90% lượt từ** theo so khớp nguyên từ (hiện **94,1%**; đã vượt 90% ngay khi xong Cấp 2: Cấp 1 → 85,4%, Cấp 2 → 91,1%, Cấp 3 → 93,0%, Cấp 4 → 94,1%).
* **AC-5.2:** Tính cả từ ghép mà mọi chữ cấu thành đều đã học (người học tự suy ra nghĩa) thì phủ **≥ 97%** (hiện 98,8%).
* **AC-5.3:** ≥ 97% của 3.000 từ phổ biến nhất có mặt trong giáo trình (hiện 99,2%; phần còn lại là tên riêng, từ tục, phiên âm nước ngoài).
* **AC-5.4 (giới hạn đo lường):** SUBTLEX-CH là phụ đề phim, nên đây là thước đo đại diện cho "phim/hội thoại/web". Từ vựng đặc thù của truyện mạng (tu tiên, cung đấu, đô thị, game…) không có trong kho tần suất này; được bổ sung bằng các bài chủ đề Cấp 3–4 và **không** nằm trong con số 94,1% nói trên.

## 3. Chất lượng
Unit/Component test, coverage ≥ 90% cả 4 chỉ số. Có test bảo vệ quy mô, tính duy nhất và độ phủ (xem SA-EPIC-02 §5).

## 4. Nguồn dữ liệu & giấy phép
Tần suất từ: SUBTLEX-CH (Cai & Brysbaert, 2010). Nghĩa Việt tham khảo bản nháp CVDICT (CC BY-SA 4.0) và CC-CEDICT (CC BY-SA 3.0); âm Hán-Việt theo bảng `hanviet-pinyin-wordlist`; danh sách HSK 3.0 để bổ sung từ nền tảng. Nghĩa Việt, câu ví dụ và bản dịch được biên soạn/biên tập lại cho giáo trình này. Chi tiết ở ADR-008.
