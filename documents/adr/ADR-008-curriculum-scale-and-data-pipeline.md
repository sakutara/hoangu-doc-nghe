# ADR-008: Quy mô giáo trình (≈ 6.600 từ) & quy trình sinh dữ liệu bài học

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-EPIC-02](../epics/epic-2-curriculum-and-quizzes/BR-EPIC-02.md), [SA-EPIC-02](../epics/epic-2-curriculum-and-quizzes/SA-EPIC-02.md), [ADR-002](ADR-002-offline-storage-and-dictionary-engine.md), [ADR-003](ADR-003-testing-and-90-percent-coverage-gate.md)

## 1. Bối cảnh
Giáo trình ban đầu chỉ có 8 bài × 6 từ (≈ 50 từ): quá ít và quá đơn giản để người học đọc được truyện mạng. Yêu cầu mới: hoàn thành giáo trình thì đã gặp **≥ 90% số từ** hay xuất hiện khi đọc truyện/lướt web/xem phim.

Số liệu thực tế (SUBTLEX-CH, ≈ 33,2 triệu lượt từ Hán, loại tên riêng): 1.000 từ đầu phủ ≈ 82%, 2.000 ≈ 88%, 3.000 ≈ 91%, 5.000 ≈ 94%, 8.000 ≈ 96%. Muốn thoải mái đọc truyện thì cần vượt xa ngưỡng 3.000 từ vì truyện mạng còn có lớp từ vựng riêng (tu tiên, cung đấu, đô thị, game…) và thành ngữ.

## 2. Quyết định
1. **Quy mô:** ≈ 6.600 từ, 266 bài, chia 4 cấp (60 / 72 / 79 / 55 bài), mỗi bài ≈ 25 từ + 3–6 câu có dịch. Mỗi bài vẫn kiểm tra ≥ 80% để mở khóa (không đổi luật Epic 2).
2. **Chọn từ theo dữ liệu, không theo cảm tính:** nền là danh sách từ phổ biến của SUBTLEX-CH (loại tên riêng, ký hiệu, từ không có trong CC-CEDICT, địa danh nước ngoài hiếm) hợp với từ HSK 3.0 cấp 1–4; xếp theo tần suất giảm dần để từ càng phổ biến càng học sớm. Cấp 1–2 là phần đầu bảng tần suất; Cấp 3 mở đầu bằng 28 bài chủ đề truyện mạng do biên soạn tay, rồi tiếp phần tần suất; Cấp 4 gồm 14 bài thành ngữ, 7 bài lóng, 2 bài từ ghép bổ sung và 32 bài **đoạn đọc** (đoạn văn 6 câu liền mạch).
3. **Độ phủ là yêu cầu kiểm thử được:** `tests/fixtures/subtlex-top12000.json` (12.000 từ đầu, kèm tổng lượt từ) và `curriculumCoverage.test.ts` khẳng định ≥ 90% (nguyên từ) và ≥ 97% (kể cả từ ghép đã biết mọi chữ). Kết quả hiện tại: 94,1% và 98,8%; 85,4% sau Cấp 1, 91,1% sau Cấp 2.
4. **Dữ liệu là mã nguồn TS tĩnh sinh tự động**, tách theo cấp (`src/data/lessons/levelN.ts`) với tuple gọn thay cho object lặp khóa, để bundle gọn (≈ 590 KB nguồn, ≈ 230 KB gzip) và vẫn được precache cho chế độ offline. Không dùng JSON lười tải vì giáo trình cần có ngay khi ngắt mạng, và `defaultSegmenter` cần toàn bộ từ vựng.
5. **Tính nhất quán của quiz được bảo vệ bằng test:** mỗi từ xuất hiện đúng một lần trong giáo trình; **nghĩa Việt phải duy nhất** (nếu hai từ cùng nghĩa, câu "Việt → Hán" sẽ có hai đáp án đúng); distractor lấy gần trước (cùng bài) rồi mới sang các bài cùng cấp để câu hỏi không quá dễ khi kho từ lớn.
6. **Quy trình biên soạn** (thư mục `scripts/curriculum/`, Python):
   1. `cand.py`/`pool.py`/`plan.py` — dựng kho từ ứng viên từ SUBTLEX-CH + HSK, tra pinyin (CC-CEDICT/CVDICT, chọn cách đọc theo ngữ nghĩa), Hán-Việt theo bảng pinyin→âm Hán-Việt (`hanviet.csv`), nháp nghĩa Việt từ CVDICT, rồi cắt thành các bài 25 từ.
   2. Người biên soạn viết/hiệu chỉnh nghĩa Việt, tên bài và câu ví dụ trong `gl/*.txt` (xem README) — nháp tự động chỉ là điểm xuất phát, mọi từ đều được rà lại.
   3. `build.py` ghép nháp + hiệu chỉnh, chuẩn hóa dấu thanh Hán-Việt (kiểu mới: `hóa`, `thụy`, `quý`), sinh pinyin câu có ngữ cảnh (pypinyin) kèm quy tắc sửa các điểm hay sai (地/得/长/场…) và **biến điệu 一/不 nhất quán**, rồi cắt từ theo từ vựng giáo trình để cách chữ như trong app.
   4. `check.py`/`dupwords.py` — báo trùng nghĩa, trùng từ, thiếu Hán-Việt, câu dùng từ chưa học; `fixgloss.py` — sửa nhanh nghĩa theo từ.
   5. `gen_ts.py` — sinh `src/data/lessons/*.ts`.
7. **Nguồn & giấy phép:** SUBTLEX-CH (Cai & Brysbaert, 2010; dùng cho nghiên cứu, ghi nguồn), CC-CEDICT (CC BY-SA 3.0), CVDICT (CC BY-SA 4.0), `hanviet-pinyin-wordlist`, danh sách HSK 3.0 (complete-hsk-vocabulary). Nghĩa Việt được biên tập lại; ứng dụng phải ghi công các nguồn CC BY-SA khi phát hành.

## 3. Hệ quả
* **Tích cực:** giáo trình đủ lớn để đọc truyện trơn tru; độ phủ đo được và được test chặn tụt; thêm/sửa bài chỉ cần sửa `gl/*.txt` rồi sinh lại; quiz đúng nghĩa ngay cả khi kho từ lớn.
* **Đánh đổi:** bundle chính tăng ≈ 230 KB gzip (đạt 359 KB gzip) và service worker cũng nặng thêm tương tự vì `defaultSegmenter` nạp từ vựng bài học — có thể tách bản từ vựng rút gọn cho SW nếu cần; thời gian học đầy đủ khoảng 266 bài (≈ 15–20 phút/bài, tức vài tháng với mục tiêu 30 phút/ngày); độ phủ đo trên phụ đề phim chứ không phải trên văn bản truyện mạng (từ chuyên ngành truyện được bổ sung bằng bài chủ đề nhưng chưa có số đo riêng). Pinyin/Hán-Việt sinh tự động có thể còn vài trường hợp sai — nguồn `hvfix.txt` và đối số `;;pinyin;;hán-việt` trong `gl/*.txt` dùng để sửa.
* **Tồn đọng:** nên đo độ phủ lại trên một kho truyện mạng thật (đã cấp phép) khi có; khóa tiến độ cũ (id `l1-1`…) vẫn dùng được nhưng điểm đã lưu của 8 bài cũ sẽ ứng với nội dung mới.
