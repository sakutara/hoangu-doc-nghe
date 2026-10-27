---
name: translate-chinese-epub
description: >-
  Use this skill when the user wants to translate a Chinese EPUB book (.epub) into a
  Vietnamese EPUB book. Follows the pipeline: Chinese EPUB -> Pre-check Anti-Scraping ->
  chinese-study Dictionary Lookup & Modern Terminology -> AI Chapter-by-Chapter
  Translation -> Vietnamese EPUB Packaging.
---

# Dịch Ebook Tiếng Hoa sang Tiếng Việt (`translate-chinese-epub`)

Quy trình dịch tiểu thuyết / sách điện tử tiếng Hoa (`.epub`) sang tiếng Việt (`.epub`) chất lượng cao, kết hợp kho từ điển hiện đại từ dự án `chinese-study` và AI dịch thuật từng chương.

```text
Ebook tiếng Hoa (.epub) ──► Từ điển chinese-study hỗ trợ ──► AI dịch từng chương ──► Xuất Ebook tiếng Việt (.epub)
```

---

## Quy trình 4 bước (Pipeline)

### Bước 1: Giải nén & Kiểm tra chất lượng Ebook tiếng Hoa
1. Chạy script kiểm tra cấu trúc EPUB nguồn:
   [inspect_and_lookup.py](./scripts/inspect_and_lookup.py)
   ```bash
   python3 ~/.gemini/config/skills/translate-chinese-epub/scripts/inspect_and_lookup.py "<đường_dẫn_file.epub>" --check
   ```
2. **Kiểm tra lỗi chống cào (Anti-scraping / Hetushu):**
   - Kiểm tra xem các thẻ `<p>` có bị lặp lại bất thường (dummy/padding nodes), bị đảo vị trí câu/đoạn văn (scrambled paragraphs) hoặc chèn watermark (`和*图*书`, `和-图-书`, ký tự `|`) hay không.
   - **QUY TẮC BẮT BUỘC:** Nếu phát hiện file EPUB bị lỗi chống cào (đảo câu, lặp câu rác), **tuyệt đối KHÔNG tự ý khôi phục nguyên tác**. Dừng lại và **báo ngay cho người dùng** biết tình trạng file nguồn để người dùng xử lý/cung cấp file sạch.

### Bước 2: Tra cứu từ điển `chinese-study` & Xây dựng Bảng thuật ngữ (Glossary)
1. Nguồn từ điển tham chiếu mặc định từ dự án `chinese-study`:
   - `/Users/sakutara/Work/chinese-study/public/cedict.json` (117.000+ mục từ Trung - Việt hiện đại)
   - `/Users/sakutara/Work/chinese-study/src/data/coreLexicon.ts` & `extraLexicon.ts`
2. Chạy script trích xuất từ vựng & gợi ý nghĩa từ `chinese-study` cho chương cần dịch:
   ```bash
   python3 ~/.gemini/config/skills/translate-chinese-epub/scripts/inspect_and_lookup.py "<đường_dẫn_file.epub>" --chapter 1
   ```
3. **Nguyên tắc chuẩn hóa thuật ngữ hiện đại:**
   - **Không lạm dụng âm Hán-Việt cổ** cho các khái niệm hiện đại, khoa huyễn, hệ thống hoặc từ mượn quốc tế.
   - Ví dụ:
     - `卡` / `卡片` ➔ **Card / Thẻ card** (như `卡徒` ➔ **Card đồ**, `制卡师` ➔ **Card sư**, `卡修` ➔ **Card tu**, `能量卡` ➔ **Card Năng Lượng**, *tuyệt đối không dịch thành "Tạp Đồ" hay "Năng lượng tạp"*).
     - Các thuật ngữ tài chính, công nghệ, đời sống (`转账` ➔ chuyển khoản, `货源` ➔ nguồn hàng, `救济房` ➔ nhà ở cứu trợ...) ưu tiên lấy theo nghĩa tiếng Việt hiện đại trong `cedict.json`.
4. **Dịch thử Chương 1 (khi bắt đầu truyện mới):**
   - Khi bắt đầu một bộ sách mới, luôn dịch trước Chương 1 kèm Bảng thuật ngữ (Glossary) gửi người dùng duyệt văn phong trước khi dịch tiếp các chương sau.

### Bước 3: AI Dịch từng chương (Chapter-by-Chapter AI Translation)
1. Đọc từng file chương gốc (`OEBPS/chXXXX.xhtml`), giữ nguyên cấu trúc phân đoạn `<p>`.
2. Dịch toàn bộ nội dung sang tiếng Việt với yêu cầu:
   - Văn phong mượt mà, tự nhiên, giàu hình ảnh, đúng thể loại (khoa huyễn, tiên hiệp, lịch sử, đô thị...).
   - Nhất quán 100% tên riêng (nhân vật, địa danh, cấp bậc, đơn vị tiền tệ) xuyên suốt các chương theo Glossary đã chốt.
   - Dịch đầy đủ, không tóm tắt hay cắt xén bất kỳ đoạn văn nào.
3. Lưu kết quả các chương đã dịch vào cấu trúc JSON trung gian (`[{"title": "...", "paragraphs": ["...", ...]}]`) để đóng gói.

### Bước 4: Đóng gói và Xuất Ebook Tiếng Việt (`.epub`)
1. Sử dụng script đóng gói chuẩn EPUB 3.0 (tương thích ngược EPUB 2.0):
   [package_epub.py](./scripts/package_epub.py)
   ```bash
   python3 ~/.gemini/config/skills/translate-chinese-epub/scripts/package_epub.py \
     --source "<file_epub_goc.epub>" \
     --chapters-json "<file_chua_ban_dich.json>" \
     --title "<Tên Truyện Tiếng Việt>" \
     --author "<Tên Tác Giả>" \
     --output "<Tên Truyện Tiếng Việt.epub>"
   ```
2. **Tiêu chuẩn kỹ thuật bắt buộc khi xuất EPUB:**
   - Giữ nguyên ảnh bìa gốc (`OEBPS/cover.jpg`) và tạo `cover.xhtml`.
   - Khởi tạo đầy đủ mục lục 2 tầng: `OEBPS/nav.xhtml` (EPUB 3) và `OEBPS/toc.ncx` (EPUB 2) với tiêu đề chương tiếng Việt.
   - Thiết lập `<dc:language>vi</dc:language>` trong `OEBPS/content.opf`.
   - File `mimetype` phải nằm đầu tiên trong gói ZIP và nén ở chế độ `ZIP_STORED` (không nén).
   - Kiểm tra tính toàn vẹn của file `.epub` đầu ra bằng `zipfile.ZipFile.testzip()`.
