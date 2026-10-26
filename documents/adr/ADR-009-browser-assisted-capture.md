# ADR-009: Tải truyện qua trình duyệt của người dùng (trang chặn bot)

## Bối cảnh
Một số trang truyện (vd. hetushu.com) đặt sau Cloudflare Managed Challenge: mọi request không đến từ trình duyệt thật
trả `HTTP 403` + `cf-mitigated: challenge`. Crawler trong Service Worker (ADR-005) và các CORS proxy đều bị chặn.
Ngoài ra trang này có thể sắp lại thứ tự đoạn bằng JS, nên HTML thô chưa chắc đúng thứ tự đọc.

## Quyết định
- **Không** tự động giải challenge, giả mạo fingerprint hay dùng trình duyệt headless “stealth”.
- Crawler nhận diện challenge (`BotChallengeError`, `DeadPointCheckpoint.errorKind = 'bot_challenge'`) và UI gợi ý chế độ mới
  thay vì nút “Cào tiếp” vô ích.
- ~~Bookmarklet~~ (đã gỡ): chế độ “Tải qua trình duyệt” bằng bookmarklet đã bị loại bỏ khỏi app; thay bằng **Chrome extension** (`extension/`).
  Người dùng tự mở trang truyện trong trình duyệt (qua challenge như người đọc bình thường), extension đọc DOM đã render, nghỉ 2–4 giây
  giữa chương và **dừng ngay** khi gặp trang kiểm tra bot hoặc không có nội dung.
- Kết quả là gói `hoangu-capture/1` (JSON, file `.hoangu.json`). App nhập bằng `CaptureBundleImporter`: tạo truyện mới hoặc nối tiếp truyện cùng
  `sourceUrl` (= `bookKey`), bỏ trùng theo URL chương (`BookMetadata.chapterUrls`).

## Giới hạn
- Cần cài extension trên trình duyệt máy tính (xem `extension/README.md`); khó dùng trên điện thoại.
- Bộ chọn nội dung theo heuristic — trang lạ có thể cần chỉnh.
