# Master Business Requirements (BR-MASTER)
**Dự án:** HoaNgữ Đọc-Nghe (Chinese Reading & Listening Webapp)  
**Phiên bản:** 1.0.0  
**Trạng thái:** Baseline (Khởi tạo kiến trúc & Epic 1)  
**Cập nhật lần cuối:** 2026-10-17  

---

## 1. Tầm nhìn & Mục tiêu Sản phẩm (Product Vision)
Xây dựng một ứng dụng web (PWA SPA) học tiếng Hoa chuyên biệt cho nhu cầu **Đọc hiểu (Reading)** và **Nghe hiểu (Listening)** thực chiến, hoạt động **100% offline**, triển khai tĩnh trên **GitHub Pages**.

### 1.1 Đối tượng người học (Target Persona)
* **Mục tiêu thực tế:** Người học **không** có nhu cầu thi chứng chỉ học thuật nặng về viết tay hay luyện phát âm giao tiếp truyền thống. Họ học tiếng Hoa với 4 mục đích rõ ràng:
  1. **Đọc truyện tiếng Hoa** (tiểu thuyết mạng, ngôn tình, tiên hiệp, võng du, sci-fi, light novel bằng file `.epub`).
  2. **Lướt web tiếng Hoa** (Bilibili, Weibo, Zhihu, Xiaohongshu, diễn đàn Tieba/NGA).
  3. **Xem phim/hoạt hình tiếng Hoa** (C-Drama, Donghua, show giải trí).
  4. **Chơi game tiếng Hoa** (RPG, Gacha, Wuxia/Xianxia, chiến thuật, giao diện & hội thoại trong game).
* **Chiến lược chữ viết (Script Strategy):**
  * **Giai đoạn hiện tại (Ưu tiên số 1):** Chữ Hán **Giản thể (`简体中文`)** — chuẩn chữ viết phổ biến nhất trên web đại lục, tiểu thuyết mạng, Bilibili và phần lớn game/phim.
  * **Giai đoạn mở rộng (Tương lai):** Hỗ trợ chuyển đổi/hiển thị song song Chữ Hán **Phồn thể (`繁體中文`)** mà không phải thiết kế lại cấu trúc dữ liệu.

---

## 2. Quy trình Phát triển & Quản trị Chất lượng (Agile Governance)
Dự án tuân thủ nghiêm ngặt quy trình **BR (Business Requirement) $\rightarrow$ SA (Solution Architect) $\rightarrow$ Test $\rightarrow$ Code**:
1. **Tài liệu Trung tâm:**
   * `docs/BR-MASTER.md`: Phản ánh toàn bộ yêu cầu nghiệp vụ hiện hành của hệ thống.
   * `docs/SA-MASTER.md`: Phản ánh kiến trúc kỹ thuật tổng thể hiện hành của hệ thống.
   * `docs/adr/ADR-xxx-*.md`: Lưu vết mọi quyết định và thay đổi ở cấp độ Solution Architecture.
2. **Phát triển theo Epic:**
   * Mọi tính năng mới được chia thành các **Epic** độc lập.
   * Mỗi Epic bắt buộc có 1 file `BR-EPIC-xx.md` và 1 file `SA-EPIC-xx.md` riêng biệt trong `docs/epics/epic-xx-*/`.
3. **Cam kết Chất lượng Kiểm thử (Test Coverage Gate):**
   * Code coverage tự động bắt buộc đạt **$\ge 90\%$** (Lines, Statements, Functions, Branches) ngay trên máy cục bộ và CI (GitHub Actions) mà không phụ thuộc vào dịch vụ coverage farm bên ngoài (như Codecov hay Coveralls).

---

## 3. Các Trụ cột Tính năng Cốt lõi (Core Functional Pillars)

### 3.1 Trụ cột 1: Từ điển Thông minh & Bộ tách từ Ngữ cảnh (Smart Segmentation & Dictionary)
* Hỗ trợ tra cứu tức thì khi chạm/click vào từ trong cả **Bài học** lẫn **Trình đọc EPUB**.
* Hiển thị đầy đủ 4 lớp thông tin:
  1. **Chữ Hán** (Giản thể mặc định; trường dữ liệu Phồn thể dự phòng).
  2. **Pinyin** (có dấu thanh điệu chuẩn).
  3. **Âm Hán-Việt** (công cụ đắc lực giúp người Việt đoán nghĩa nhanh gấp 3-5 lần).
  4. **Nghĩa tiếng Việt** (kèm nhãn ngữ cảnh: thông dụng, tiểu thuyết, lóng mạng, thuật ngữ game, từ ngoại lai).
* **Độ thông minh của bộ tách từ:**
  * Nhận diện chính xác **từ đơn (1 chữ)**, **từ kép (2 chữ)**, **từ liên 3 (3 chữ)**, **thành ngữ/cụm 4 chữ**.
  * Nhận diện **tiếng lóng mạng & thuật ngữ game/truyện** (ví dụ: `破防` - phá phòng/vỡ trận cảm xúc, `氪金` - nạp tiền game, `肝` - cày cuốc, `吃瓜` - hóng chuyện, `满级` - max cấp, `开挂` - bật hack/bàn tay vàng).
  * Nhận diện **từ có nguồn gốc tiếng Anh / từ ngoại lai** phiên âm hoặc dịch nghĩa hiện đại (ví dụ: `卡` - card/thẻ/lag, `注册` - register/đăng ký, `寄存器` - register thanh ghi, `秀` - show/biểu diễn, `粉丝` - fans, `酷` - cool, `趴` - party, `艾特` - @/mention, `拉黑` - block/blacklist).

### 3.2 Trụ cột 2: Giáo trình Cụ thể & Hệ thống Bài học + Bài kiểm tra (Curriculum, Lessons & Quizzes)
* Giáo trình được thiết kế từ **Cơ bản (Sơ cấp)** đến **Nâng cao (Thực chiến Đọc Truyện / Web / Phim / Game)**, loại bỏ hoàn toàn bài tập tập viết nét chữ hay thu âm chấm điểm phát âm.
* **Quy mô & mục tiêu độ phủ:** toàn giáo trình ≈ 6.600 từ / 266 bài, phủ **≥ 90% số từ** gặp khi đọc truyện mạng, lướt web, xem phim (đo được: 94,1% trên kho tần suất phụ đề; xem [ADR-008](adr/ADR-008-curriculum-scale-and-data-pipeline.md)), để người học hoàn thành xong là đọc trơn tru truyện mạng.
* **Cấu trúc các cấp độ (Levels):**
  * **Cấp độ 1 — Nền tảng Nhập môn & Hán-Việt Cốt lõi:** Đại từ, số đếm, cấu trúc câu cơ bản, 1.500 từ tần suất cao nhất trong hội thoại & giao diện web/game.
  * **Cấp độ 2 — Giao tiếp Phim ảnh & Lướt Web:** Từ vựng cảm xúc, mạng xã hội, bình luận video, hội thoại đời thường trong C-Drama (≈ 1.800 từ tiếp theo).
  * **Cấp độ 3 — Ngôn ngữ Tiểu thuyết Mạng & Thế giới Game:** 28 bài chủ đề (tu tiên/kiếm hiệp/cung đình/đô thị/xuyên không/võng du, hệ thống trang bị/kỹ năng, miêu tả hành động và tâm lý nhân vật, xưng hô cổ) cùng ≈ 1.300 từ tần suất tiếp theo.
  * **Cấp độ 4 — Thành ngữ, Tiếng lóng Hiện đại & Đọc hiểu Đoạn văn Dài:** ≈ 350 thành ngữ 4 chữ, tiếng lóng/từ mượn tiếng Anh, từ ghép thường gặp, và 32 bài đoạn đọc liền mạch.
* **Cơ chế học & Kiểm tra:**
  * Mỗi bài học gồm: Từ vựng trọng tâm (có audio nghe mẫu + Hán-Việt), Đoạn hội thoại/văn bản ngắn luyện đọc & nghe, và Bài tập tương tác nhanh.
  * **Bài kiểm tra theo tiến độ (Milestone Quiz):** Cuối mỗi bài học hoặc mỗi chặng có bài kiểm tra tổng hợp (Nghe chọn nghĩa Việt, Hán → Việt, Việt → Hán, Đọc câu chọn bản dịch; không kiểm tra pinyin/âm Hán-Việt). Đạt điểm chuẩn ($\ge 80\%$) sẽ mở khóa tiến độ tiếp theo.

### 3.3 Trụ cột 3: Theo dõi Tiến độ & Nhắc học Mỗi ngày 30 Phút (Progress & Daily Habit)
* **Mục tiêu 30 phút/ngày:** Bộ đếm thời gian học thực tế trong ngày (tự động ghi nhận khi người dùng học bài, làm bài kiểm tra, ôn từ vựng hoặc đọc truyện EPUB).
* **Hệ thống Nhắc học (Daily Reminder):**
  * Cho phép thiết lập khung giờ nhắc học hàng ngày.
  * Hiển thị cảnh báo/nhắc nhở trực quan ngay trong ứng dụng và thông qua Web Notification API (khi được cấp quyền trên PWA) nếu trong ngày chưa đủ 30 phút.
* **Thống kê Tiến độ & Kho từ vựng (SRS):**
  * Chuỗi ngày học liên tiếp (Streak), phần trăm hoàn thành giáo trình, điểm số các bài kiểm tra, và danh sách từ vựng đã lưu từ bài học/truyện EPUB để ôn tập.

### 3.4 Trụ cột 4: Quản lý Tủ Truyện, Lưu Trữ File Theo Thư Mục & Trình Đọc Truyện Tinh Giản (Smart Reader & Book Manager)
* **Lưu trữ trên File System để chống ngốn RAM (`1 Truyện = 1 Thư mục`, `1 Chương = 1 File`):**
  * Nội dung truyện **tuyệt đối không nạp toàn bộ vào RAM** hay nhồi vào một bản ghi DB khổng lồ.
  * Mỗi bộ truyện được lưu trên một thư mục riêng biệt (`/books/<bookId>/`) trên hệ thống file cục bộ của trình duyệt (OPFS - Origin Private File System), trong đó **mỗi chương là 1 file văn bản độc lập (`chapter-0001.txt`, `chapter-0002.txt`...)**.
  * Database (`IndexedDB`) chỉ lưu thông tin quản lý nhẹ (Metadata: ID truyện, tên truyện, ngôn ngữ `ZH`/`VI`, tổng số chương, danh sách tiêu đề chương, vị trí đang đọc). Khi người dùng mở đọc chương nào, ứng dụng chỉ đọc đúng 1 file của chương đó lên RAM.
* **Tinh giản hóa nội dung tuyệt đối khi Upload `.epub` và khi Cào truyện:**
  * Khi người dùng tải file `.epub` lên hoặc cào truyện từ web, hệ thống **chỉ trích xuất và lưu nội dung văn bản thuần (Plain Text)**: loại bỏ 100% hình ảnh (`<img>`, `<svg>`, ảnh bìa nhúng), loại bỏ toàn bộ định dạng HTML/CSS/font/style rườm rà.
* **Trang Quản lý Danh sách Truyện & Xóa Truyện Triệt để:**
  * Có trang **Quản lý Tủ Truyện** tập trung hiển thị tất cả các bộ truyện trong ứng dụng (truyện upload `.epub`, truyện cào tiếng Hoa, và truyện đã dịch sang tiếng Việt).
  * Cho phép thực hiện các thao tác trên từng bộ truyện: **Đọc ngay**, **Dịch sang tiếng Việt**, **Cào tiếp / Dịch tiếp (nếu đang dừng ở điểm chết)**, **Xuất file `.epub`**, và **Xóa truyện khỏi app** (xóa sạch toàn bộ thư mục chứa các file chương của truyện trên đĩa kèm bản ghi trong DB để giải phóng dung lượng ngay lập tức).
* **Trình đọc tích hợp Dịch Chạm Thông Minh:**
  * Khi đang đọc truyện tiếng Hoa, chạm vào bất kỳ vị trí chữ Hán nào để hiện Popover: Chữ Hán, Pinyin, Hán-Việt, Nghĩa tiếng Việt (từ ghép, từ liên 3, tiếng lóng, từ gốc Anh), nghe TTS và lưu từ vựng.

### 3.5 Trụ cột 5: Tự Động Cào Truyện Online Ngầm (Service Worker Crawler), Lưu Điểm Chết & Xuất File EPUB
* **Cào truyện tinh giản từ Link bất kỳ vào Thư mục Truyện & DB:**
  * Người dùng dán URL trang mục lục hoặc một chương truyện tiếng Hoa online.
  * Hệ thống tự động bóc tách tiêu đề truyện, tên chương và **lọc lấy văn bản chữ Hán thuần túy (không lưu hình ảnh, không lưu định dạng HTML/CSS)**, ghi từng chương thành từng file riêng biệt trong thư mục `/books/<bookId>/chapter-XXXX.txt` và cập nhật metadata vào DB.
* **Chạy ngầm bằng Service Worker (Kể cả khi tắt màn hình điện thoại):**
  * Tiến trình cào truyện thực thi bên trong **Custom Service Worker** kết hợp **Background Sync / Periodic Sync** và cơ chế giữ tiến trình, giúp việc tải hàng trăm chương truyện tiếp tục diễn ra ngay cả khi người dùng tắt màn hình điện thoại.
* **Tự động phát hiện & Tải chương mới (Auto-Next & Incremental Chapter Discovery):**
  * Tự động lần theo liên kết **"Chương tiếp theo" (`下一章` / `下一页`)** hoặc đối chiếu danh sách mục lục (TOC) để tự động tải tiếp các chương mới phát hành mà không cần cào lại từ đầu.
* **Lưu và Nhớ "Điểm Chết" (Dead-Point Checkpointing & Fault-Tolerant Resume):**
  * Khi quá trình cào gặp lỗi tại một chương bất kỳ, hệ thống lập tức ghi nhận **"Điểm chết" (`DeadPointCheckpoint`)** vào DB (`failedUrl`, `failedChapterIndex`, `lastSuccessChapterUrl`, `errorReason`, `retryCount`).
  * Người dùng có thể bấm **"Cào tiếp từ điểm chết"** để nối lại chính xác từ chương bị đứt quãng.
* **Xuất & Tải xuống thành file `.epub` chuẩn (EPUB Export):**
  * Đọc lần lượt từng file chương trong thư mục truyện để đóng gói thành file `.epub` văn bản thuần nhẹ gọn, tải về thiết bị.

### 3.6 Trụ cột 6: Dịch Truyện Chạy Ngầm (Tiếng Hoa $\rightarrow$ Tiếng Việt), Lưu Điểm Chết & Sinh Bộ Truyện Tiếng Việt
* **Dịch toàn bộ một bộ truyện tiếng Hoa có sẵn trong DB sang tiếng Việt:**
  * Từ trang Quản lý Tủ Truyện, người dùng có thể chọn bất kỳ bộ truyện tiếng Hoa nào đã có trong app (từ upload `.epub` hoặc từ cào online) và bấm **"Dịch bộ truyện sang Tiếng Việt"**.
  * Hệ thống tạo ra một **bộ truyện tiếng Việt mới** trong DB (liên kết với truyện gốc tiếng Hoa), tự động **dịch tiêu đề truyện sang tiếng Việt**, dịch tiêu đề từng chương và nội dung từng chương sang tiếng Việt.
* **Lưu trữ trên File System theo từng chương (`1 Chương Dịch = 1 File`):**
  * Bộ truyện tiếng Việt cũng được lưu trong một thư mục riêng (`/books/<viBookId>/`) với mỗi chương đã dịch là một file văn bản thuần (`chapter-0001.txt`...), đảm bảo không tốn RAM và có thể mở đọc hoặc xuất ra file `.epub` tiếng Việt bất cứ lúc nào.
* **Chạy ngầm bằng Service Worker & Lưu "Điểm Chết" Dịch Thuật (Translation Dead-Point Resume):**
  * Tiến trình dịch từng chương chạy ngầm trong **Service Worker** (hoạt động liên tục kể cả khi tắt màn hình điện thoại).
  * Nếu quá trình dịch bị lỗi ở chương thứ $k$ (do mất kết nối, giới hạn quota/rate-limit hoặc hệ điều hành ngắt tiến trình), hệ thống lưu lại **"Điểm chết dịch thuật" (`TranslationDeadPointCheckpoint`)** tại chương $k$. Khi bấm **"Dịch tiếp"**, Service Worker đọc từ file chương thứ $k$ của bộ gốc và dịch nối tiếp mà không phải dịch lại các chương $1 \dots k-1$.

---

## 4. Yêu cầu Phi chức năng (Non-Functional Requirements)

| Mã NFR | Hạng mục | Yêu cầu chi tiết |
| :--- | :--- | :--- |
| **NFR-01** | **Kiến trúc PWA & SPA** | Là Single Page Application có `manifest.webmanifest` và Custom Service Worker (`injectManifest`), cài đặt được lên màn hình chính (Desktop/Mobile). |
| **NFR-02** | **Hoạt động Offline 100%** | Sau lần tải đầu tiên, toàn bộ giáo trình, từ điển, trình đọc truyện, bộ dịch offline cơ sở, truyện đã lưu trên file và dữ liệu tiến độ hoạt động mượt mà khi ngắt kết nối Internet. |
| **NFR-03** | **Triển khai GitHub Pages** | Đóng gói hoàn toàn tĩnh (Static Bundle), tương thích với đường dẫn tương đối (`base` path) trên GitHub Pages và hỗ trợ CORS Proxy linh hoạt. |
| **NFR-04** | **Độ phủ Kiểm thử ($\ge 90\%$)** | Tự động kiểm tra coverage cho toàn bộ codebase nghiệp vụ (bao gồm cả File System Store, Plain-Text Sanitizer, Crawler, Translator, Checkpoint điểm chết và đóng gói EPUB) và giao diện với ngưỡng cứng $\ge 90\%$ trên cả 4 chỉ số: Lines, Statements, Functions, Branches. |
| **NFR-05** | **Hiệu năng Tra từ** | Thời gian tách câu và tra từ khi chạm trong Reader phải $< 15\text{ms}$ trên thiết bị di động tầm trung. |
| **NFR-06** | **Độ bền Tiến trình Ngầm (Crawler & Translator Resilience)** | Ghi từng chương ra file riêng biệt và cập nhật checkpoint theo từng chương (per-chapter atomic commit); không bao giờ làm mất tiến độ khi rớt mạng hay tắt màn hình. |
| **NFR-07** | **Tối ưu RAM & Dung lượng Lưu trữ** | Mỗi truyện lưu trên 1 thư mục riêng, mỗi chương là 1 file plain-text (không ảnh, không định dạng HTML/CSS). Chỉ load duy nhất chương đang đọc/đang xử lý vào RAM. Khi xóa truyện, xóa sạch toàn bộ thư mục file của truyện đó. |

---

## 5. Lộ trình Các Epic (Agile Epic Roadmap)

| Mã Epic | Tên Epic | Mô tả Phạm vi | Tài liệu BR / SA | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| **EPIC-01** | **Foundation, Core File/DB Storage, Smart Dictionary Engine & App Shell** | Khởi tạo PWA SPA, IndexedDB + File System per-chapter storage (`BookFileSystemStore`), Bộ lọc văn bản thuần (`PlainTextSanitizer`), Bộ tách từ & Từ điển thông minh, tính giờ 30p/ngày và khung điều hướng. | [BR-EPIC-01](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-1-foundation-and-core/BR-EPIC-01.md) / [SA-EPIC-01](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-1-foundation-and-core/SA-EPIC-01.md) | **Đang thiết kế (Ready for Review)** |
| **EPIC-02** | **Structured Curriculum, Reading/Listening Lessons & Milestone Quizzes** | Hệ thống giáo trình 4 cấp độ (Web/Phim/Truyện/Game), trình học bài đọc-nghe, phát âm TTS offline và bài kiểm tra mở khóa tiến độ. | [BR-EPIC-02](epics/epic-2-curriculum-and-quizzes/BR-EPIC-02.md) / [SA-EPIC-02](epics/epic-2-curriculum-and-quizzes/SA-EPIC-02.md) | **Đã triển khai** |
| **EPIC-03** | **Progress Analytics, SRS Vocabulary Vault & Daily 30m Reminder** | Bảng điều khiển tiến độ chi tiết, sổ từ vựng cá nhân (SRS Flashcards nghe-đọc), cấu hình nhắc học 30p mỗi ngày (In-app + Web Notification). | [BR-EPIC-03](epics/epic-3-progress-and-reminder/BR-EPIC-03.md) / [SA-EPIC-03](epics/epic-3-progress-and-reminder/SA-EPIC-03.md) | **Đã triển khai** |
| **EPIC-04** | **Plain-Text EPUB Upload, Lazy-Loaded Chapter Reader & Book Library Manager** | Upload `.epub` tinh giản (lọc bỏ ảnh & định dạng, lưu mỗi chương 1 file trong thư mục truyện), đọc truyện lazy-load từng chương kèm dịch chạm, Trang quản lý danh sách truyện & Xóa toàn bộ thư mục truyện. | [BR-EPIC-04](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-4-epub-reader/BR-EPIC-04.md) / [SA-EPIC-04](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-4-epub-reader/SA-EPIC-04.md) | **Đang thiết kế (Ready for Review)** |
| **EPIC-05** | **Service Worker Plain-Text Novel Crawler, Dead-Point Resume & EPUB Exporter** | Tự động cào truyện online bằng Service Worker (chạy cả khi tắt màn hình), chỉ lưu văn bản thuần vào từng file chương, tự dò chương mới, lưu & cào tiếp từ điểm chết, xuất thành file `.epub`. | [BR-EPIC-05](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-5-novel-crawler-and-epub-export/BR-EPIC-05.md) / [SA-EPIC-05](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-5-novel-crawler-and-epub-export/SA-EPIC-05.md) | **Đang thiết kế (Ready for Review)** |
| **EPIC-06** | **Service Worker Background Novel Translator (ZH $\rightarrow$ VI) & Dead-Point Resume** | Dịch bộ truyện tiếng Hoa trong DB sang bộ truyện tiếng Việt (có tiêu đề tiếng Việt, lưu từng chương trên file riêng), chạy ngầm bằng Service Worker, nhớ điểm chết khi dịch lỗi và chạy tiếp từ điểm chết. | [BR-EPIC-06](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-6-novel-translator/BR-EPIC-06.md) / [SA-EPIC-06](file:///Users/sakutara/Work/chinese-study/docs/epics/epic-6-novel-translator/SA-EPIC-06.md) | **Đang thiết kế (Ready for Review)** |
| **EPIC-07** | **Traditional Chinese (`繁體`) Support & Expansion Packs** | Bật chế độ chuyển đổi Giản thể $\leftrightarrow$ Phồn thể trên toàn ứng dụng và mở rộng bộ từ điển chuyên ngành. | `docs/epics/epic-7-traditional-chinese/` | Kế hoạch (Future) |
