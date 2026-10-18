# ADR-007: Bộ lập lịch SRS Leitner, Phân tích Tiến độ & Trạng thái Nhắc học Cục bộ

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-EPIC-03](../epics/epic-3-progress-and-reminder/BR-EPIC-03.md), [SA-EPIC-03](../epics/epic-3-progress-and-reminder/SA-EPIC-03.md), [ADR-002](ADR-002-offline-storage-and-dictionary-engine.md)

## 1. Bối cảnh
Epic 3 cần ôn từ ngắt quãng, thống kê tiến độ và nhắc học, chạy 100% offline, test xác định và không thêm dependency.

## 2. Quyết định
1. **Leitner 7 hộp** (0-1-3-7-14-30-60 ngày) thay cho SM-2: dễ giải thích, chỉ cần 3 trường trạng thái, hàm thuần với ngày truyền vào nên test xác định. Đổi sang SM-2 sau này chỉ cần thay `reviewCard`.
2. **Thẻ SRS tách khỏi sổ từ:** `srs_cards` chỉ giữ lịch ôn, tham chiếu từ qua `simplified` (khóa trừu tượng Giản thể – tương thích ADR-004); nội dung từ vẫn lấy từ `saved_words`. `syncSrs` giữ hai bên nhất quán.
3. **Mọi hàm nghiệp vụ nhận `today`/`hhmm` làm tham số**, không đọc đồng hồ ngầm; UI truyền `new Date()`.
4. **Trạng thái nhắc (snooze/dismiss) lưu theo ngày** trong localStorage (`reminder_state`), tự vô hiệu khi sang ngày mới.
5. Biểu đồ dựng bằng HTML/CSS thuần (không thư viện biểu đồ) để giữ bundle nhẹ.

## 3. Hệ quả
Không cần migration dữ liệu; thẻ được tạo lười khi mở trang. Đồng bộ đa thiết bị nằm ngoài phạm vi.
