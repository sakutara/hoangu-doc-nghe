# ADR-009: Tải truyện qua trình duyệt của người dùng (trang chặn bot)

## Bối cảnh
Một số trang truyện (vd. hetushu.com) đặt sau Cloudflare Managed Challenge: mọi request không đến từ trình duyệt thật
trả `HTTP 403` + `cf-mitigated: challenge`. Crawler trong Service Worker (ADR-005) và các CORS proxy đều bị chặn.
Ngoài ra trang này có thể sắp lại thứ tự đoạn bằng JS, nên HTML thô chưa chắc đúng thứ tự đọc.

## Quyết định
- **Không** tự động giải challenge, giả mạo fingerprint hay dùng trình duyệt headless “stealth”.
- Crawler nhận diện challenge (`BotChallengeError`, `DeadPointCheckpoint.errorKind = 'bot_challenge'`) và UI gợi ý chế độ mới
  thay vì nút “Cào tiếp” vô ích.
- Chế độ **Tải qua trình duyệt**: người dùng tự mở trang chương trong trình duyệt của họ (qua challenge như người đọc bình thường),
  bấm một bookmarklet (`captureBookmarklet.ts`). Bookmarklet đọc DOM đã render, lần theo “下一章” bằng iframe cùng origin,
  nghỉ 2–4 giây giữa chương, tối đa 200 chương/lượt, và **dừng ngay** khi gặp trang kiểm tra bot hoặc không có nội dung.
- Kết quả là gói `hoangu-capture/1` (JSON). App nhập bằng `CaptureBundleImporter`: tạo truyện mới hoặc nối tiếp truyện cùng
  `sourceUrl` (= `bookKey`), bỏ trùng theo URL chương (`BookMetadata.chapterUrls`).

## Giới hạn
- Bookmarklet bị chặn trên trang có CSP nghiêm ngặt (`script-src` cấm `javascript:`); khi đó dán `buildBookmarkletSource()` vào
  userscript manager hoặc console.
- Khó dùng trên điện thoại; khuyến nghị máy tính.
- Bộ chọn nội dung theo heuristic (`#content`, `.Readarea`, `article`, khối nhiều chữ Hán nhất) — trang lạ có thể cần chỉnh.
