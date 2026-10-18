# Business Requirement — EPIC-03: Bảng Tiến độ, Sổ Từ vựng SRS & Nhắc học 30 phút/ngày

* **Mã Epic:** EPIC-03
* **Tên Epic:** Progress Analytics, SRS Vocabulary Vault & Daily 30m Reminder
* **Trạng thái:** Đã triển khai (Implemented)
* **Liên kết:** [BR-MASTER](../../BR-MASTER.md) (Trụ cột 3) | [SA-EPIC-03](SA-EPIC-03.md) | [ADR-007](../../adr/ADR-007-srs-scheduler-and-progress-analytics.md)

## 1. Mục tiêu
Giúp người học **duy trì thói quen 30 phút/ngày** và **nhớ lâu từ vựng** đã lưu từ bài học / truyện, hoàn toàn offline:
1. Thấy rõ tiến độ: streak, thời gian học theo ngày, % giáo trình, điểm các bài kiểm tra.
2. Ôn từ vựng đã lưu bằng flashcard lặp lại ngắt quãng (SRS) theo hai chế độ **Đọc** và **Nghe**.
3. Cấu hình mục tiêu & nhắc học linh hoạt, không gây phiền (nhắc lại sau, bỏ qua hôm nay).

## 2. Yêu cầu chức năng

### FR-03.1 Bảng điều khiển tiến độ (`#/progress`)
* **AC-1.1:** Hiển thị: chuỗi ngày hiện tại, chuỗi dài nhất, tổng thời gian học, số ngày đạt mục tiêu.
* **AC-1.2:** Biểu đồ cột thời gian học theo ngày, chuyển được giữa **7 ngày** và **30 ngày**; ngày đạt mục tiêu được đánh dấu.
* **AC-1.3:** Hiển thị % hoàn thành giáo trình và điểm tốt nhất / trạng thái từng bài, nhóm theo cấp độ.
* **AC-1.4:** Hiển thị tóm tắt sổ từ: tổng số từ, số từ cần ôn hôm nay, số từ đã thuộc.

### FR-03.2 Ôn từ vựng SRS (`#/review`)
* **AC-2.1:** Mọi từ trong Sổ từ vựng tự động có thẻ ôn; xóa từ khỏi sổ thì thẻ biến mất.
* **AC-2.2:** Phiên ôn gồm các thẻ đến hạn (tối đa 20 thẻ/phiên). Hai chế độ: **Đọc** (hiện chữ Hán → tự nhớ nghĩa) và **Nghe** (phát âm TTS → tự nhớ chữ/nghĩa). Mặt sau hiện đủ Hán – Pinyin – Hán-Việt – nghĩa Việt.
* **AC-2.3:** Sau khi lật thẻ, người học tự chấm **Quên / Khó / Tốt / Dễ**; hệ thống lên lịch lần ôn kế tiếp theo hộp Leitner (khoảng cách 0-1-3-7-14-30-60 ngày). Thẻ chấm **Quên** quay lại cuối phiên và rơi về hộp 0.
* **AC-2.4:** Khi hết thẻ đến hạn hiển thị tổng kết phiên, hoặc thông báo “Hôm nay không còn từ cần ôn” kèm ngày ôn gần nhất.
* **AC-2.5:** Thời gian ôn tính vào mục tiêu 30 phút/ngày (bộ đếm toàn cục).

### FR-03.3 Mục tiêu & nhắc học
* **AC-3.1:** Cho phép chỉnh mục tiêu số phút/ngày (1–240, mặc định 30), bật/tắt nhắc, đổi giờ nhắc, xin quyền Web Notification.
* **AC-3.2:** Banner nhắc trong app có nút **“Nhắc lại sau 10 phút”** và **“Bỏ qua hôm nay”**; trạng thái này chỉ áp dụng trong ngày và được lưu offline.
* **AC-3.3:** Thông báo hệ thống chỉ bắn khi banner chuyển sang hiển thị và đã được cấp quyền; không có Notification API vẫn chạy bình thường.
* **AC-3.4:** Đổi mục tiêu có hiệu lực ngay trên thanh tiến độ, không cần tải lại trang.

## 3. Chất lượng
Unit/Component test cho `SrsScheduler`, `ProgressAnalytics`, `ReminderService`, `ProgressPage`, `ReviewPage`, `VocabularyAndHabitPage`; coverage ≥ 90% cả 4 chỉ số.
