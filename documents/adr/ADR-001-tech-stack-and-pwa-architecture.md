# ADR-001: Lựa chọn Tech Stack (React + TypeScript + Vite) và Kiến trúc Offline PWA trên GitHub Pages

* **Trạng thái:** Đã chấp thuận (Accepted)
* **Ngày tạo:** 2026-10-17
* **Liên quan đến:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/documents/BR-MASTER.md), [SA-MASTER](file:///Users/sakutara/Work/chinese-study/documents/SA-MASTER.md)

## 1. Bối cảnh (Context)
Ứng dụng học tiếng Hoa (Đọc & Nghe) cần đáp ứng các yêu cầu kỹ thuật cốt lõi:
1. Là một **PWA Single Page Application (SPA)** có thể cài đặt lên thiết bị di động và máy tính.
2. Có khả năng **hoạt động 100% offline** sau lần truy cập đầu tiên.
3. Được triển khai tĩnh hoàn toàn miễn phí trên **GitHub Pages** (không có máy chủ Node/Python ở phía sau, và thường chạy dưới một sub-path như `https://<username>.github.io/chinese-study/`).
4. Phải đạt độ phủ kiểm thử tự động **$\ge 90\%$** với tốc độ phản hồi nhanh trong quá trình phát triển Agile (BR $\rightarrow$ SA $\rightarrow$ Test $\rightarrow$ Code).

## 2. Quyết định (Decision)
Chúng tôi quyết định lựa chọn bộ công nghệ:
* **Frontend Framework:** React 18 + TypeScript (Strict Mode).
* **Bundler & Dev Server:** Vite.
* **PWA & Service Worker:** `vite-plugin-pwa` (sử dụng chiến lược `injectManifest` với Custom TypeScript Service Worker `src/sw/custom-sw.ts`: vừa precache toàn bộ bundle JS/CSS/JSON/Font/HTML cho chế độ offline, vừa thực thi tác vụ chạy ngầm như Background Novel Crawler trong [ADR-005](file:///Users/sakutara/Work/chinese-study/documents/adr/ADR-005-service-worker-novel-crawler-and-epub-export.md)).
* **Cơ chế Điều hướng (Routing):** Sử dụng **Hash-based Routing** (hoặc quản lý state tab kết hợp URL hash `#/lessons`, `#/reader`, `#/progress`, `#/dictionary`) và cấu hình `base: './'` trong `vite.config.ts`.
* **Styling:** Tailwind CSS.

## 3. Lý do lựa chọn (Rationale)
* **Tương thích hoàn hảo với GitHub Pages:** Việc dùng `base: './'` kết hợp điều hướng dựa trên Hash (`#/...`) giúp ứng dụng chạy đúng ở bất kỳ tên repository nào hoặc thậm chí mở trực tiếp từ bộ nhớ đệm offline mà không bao giờ gặp lỗi `404 Not Found` của GitHub Pages khi người dùng tải lại trang (F5).
* **Hỗ trợ PWA Offline mạnh mẽ:** `vite-plugin-pwa` tự động lập danh mục (manifest) tất cả các tài sản tĩnh, bao gồm cả dữ liệu từ điển tiếng Hoa và truyện EPUB mẫu, nạp sẵn vào Cache Storage của trình duyệt ngay trong lần mở đầu tiên.
* **Hệ sinh thái Test đồng nhất:** Vite kết hợp trực tiếp với Vitest dùng chung một file cấu hình `vite.config.ts`, giúp kiểm thử component và logic nghiệp vụ cực kỳ nhanh và chính xác.

## 4. Hệ quả (Consequences)
* **Tích cực:** Không tốn chi phí vận hành server; tốc độ chuyển trang tức thì; chạy offline ổn định trên cả iOS Safari, Android Chrome và Desktop.
* **Đánh đổi & Giải pháp:** Kích thước gói tài nguyên ban đầu sẽ bao gồm bộ từ điển cốt lõi tĩnh, vì vậy dữ liệu từ điển cần được thiết kế gọn, có cấu trúc chỉ mục trên bộ nhớ nhanh để đảm bảo tải trang lần đầu dưới 2 giây.
