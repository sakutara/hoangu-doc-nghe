# ADR-003: Chiến lược Kiểm thử Tự động và Cổng Chất lượng 90% Coverage không dùng Coverage Farm

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/docs/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/docs/SA-MASTER.md)

## 1. Bối cảnh (Context)
Dự án yêu cầu quy trình phát triển chặt chẽ **BR $\rightarrow$ SA $\rightarrow$ Test $\rightarrow$ Code** và đặt mục tiêu bắt buộc **Test Coverage đạt tối thiểu 90%** mà không sử dụng các dịch vụ coverage farm bên ngoài (như Codecov, Coveralls hay SonarCloud).

## 2. Quyết định (Decision)
1. **Công cụ Kiểm thử & Đo lường Coverage:**
   * Sử dụng **Vitest** kết hợp với **`@vitest/coverage-v8`** và **`@testing-library/react`** (chạy trên môi trường `jsdom`).
2. **Thiết lập Cổng chặn Cứng (Hard Thresholds) trong `vite.config.ts`:**
   * Cấu hình trực tiếp trong `vite.config.ts`:
     ```ts
     coverage: {
       provider: 'v8',
       reporter: ['text', 'html', 'json-summary'],
       thresholds: {
         lines: 90,
         functions: 90,
         branches: 90,
         statements: 90,
       },
     }
     ```
   * Bất kỳ lần chạy `npm run test:coverage` nào có một trong bốn chỉ số dưới `90%` sẽ lập tức thất bại (exit code `1`), ngăn chặn việc hợp nhất code hoặc deploy lên GitHub Pages.
3. **Kiến trúc Code thân thiện với Kiểm thử (Testable Architecture):**
   * Tách toàn bộ nghiệp vụ phức tạp (tách từ, tra từ điển, chấm điểm quiz, tính toán chuỗi ngày học & mục tiêu 30 phút, phân tích file EPUB) vào tầng `src/domains/` dưới dạng hàm/lớp không phụ thuộc chặt vào DOM.
   * Các Browser APIs (`localStorage`, `indexedDB`, `Notification`, `speechSynthesis`) được bọc qua các service adapter có giao diện rõ ràng để kiểm thử đầy đủ cả nhánh thành công lẫn nhánh lỗi/fallback.

## 3. Hệ quả (Consequences)
* **Tích cực:** Kiểm tra coverage hoàn toàn độc lập, chạy offline 100% trên máy lập trình viên và chạy miễn phí trong GitHub Actions mà không cần tài khoản hay token của dịch vụ bên thứ ba.
* **Kỷ luật phát triển:** Mọi tính năng mới trong từng Epic đều phải viết bộ Unit Test & Component Integration Test song hành trước khi nghiệm thu.
