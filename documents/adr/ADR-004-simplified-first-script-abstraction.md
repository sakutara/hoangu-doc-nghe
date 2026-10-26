# ADR-004: Chiến lược Ưu tiên Chữ Hán Giản thể và Lớp Trừu tượng Mở rộng Phồn thể

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/documents/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/documents/SA-MASTER.md)

## 1. Bối cảnh (Context)
Người học hiện tại ưu tiên tuyệt đối **Chữ Hán Giản thể (`简体中文`)** để đọc truyện mạng đại lục, lướt web, xem phim và chơi game ngay lập tức. Tuy nhiên, trong tương lai ứng dụng sẽ bổ sung tính năng hỗ trợ **Chữ Hán Phồn thể (`繁體中文`)** (phục vụ truyện/web/game Đài Loan, Hồng Kông). Nếu thiết kế cứng chỉ một loại chữ ngay từ đầu, việc nâng cấp sau này sẽ phải sửa lại toàn bộ dữ liệu từ điển, giáo trình và bộ tách từ.

## 2. Quyết định (Decision)
1. **Mô hình Dữ liệu Sẵn sàng Song thể (Dual-Script Ready Schema):**
   * Mọi cấu trúc dữ liệu từ vựng (`DictionaryEntry`) và bài học (`LessonItem`) đều sử dụng trường `simplified: string` làm chuẩn mặc định và có sẵn trường tùy chọn `traditional?: string`.
2. **Cấu hình Ngôn ngữ Hiển thị (`ScriptPreference`):**
   * Trong `UserSettings`, định nghĩa kiểu `scriptMode: 'simplified' | 'traditional'` với giá trị mặc định là `'simplified'`.
   * Trong giai đoạn hiện tại (Epic 1 - Epic 4), giao diện ưu tiên hiển thị Giản thể và hiển thị nhãn thông báo tính năng Phồn thể đang được chuẩn bị cho lộ trình mở rộng (Epic 5), đồng thời cho phép hiển thị chữ Phồn thể tham khảo bên cạnh chữ Giản thể trong Popover từ điển khi mục từ đó có chữ Phồn thể khác biệt.

## 3. Hệ quả (Consequences)
* **Tích cực:** Giữ cho trải nghiệm học Giản thể hiện tại tinh gọn, không làm người mới học bị rối bởi hai bộ chữ, trong khi kiến trúc dữ liệu và bộ tách từ đã sẵn sàng 100% để bật chế độ Phồn thể ở Epic 5 mà không gây breaking change.
