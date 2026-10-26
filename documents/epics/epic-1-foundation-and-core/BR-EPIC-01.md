# Business Requirement — EPIC-01: Nền tảng PWA, Lưu trữ Offline, Bộ Tách Từ & Từ Điển Thông Minh (Foundation & Core Engine)

* **Mã Epic:** EPIC-01
* **Tên Epic:** Foundation, Core Storage, Smart Dictionary Engine & App Shell
* **Trạng thái:** Chờ duyệt (Pending User Review)
* **Liên kết Tài liệu Chung:** [BR-MASTER](file:///Users/sakutara/Work/chinese-study/documents/BR-MASTER.md) | [SA-MASTER](file:///Users/sakutara/Work/chinese-study/documents/SA-MASTER.md)

---

## 1. Mục tiêu Nghiệp vụ (Business Objective)
Xây dựng nền móng vững chắc cho ứng dụng học tiếng Hoa (Đọc & Nghe) dưới dạng **Offline PWA SPA**, đồng thời hoàn thiện ngay **trái tim của sản phẩm**: **Bộ Tách Từ & Tra Từ Điển Tiếng Hoa Thông Minh (`SmartSegmenter` + `WordLookupPopover`)** và **Bộ Đếm Mục Tiêu 30 Phút/Ngày**.

Các thành phần trong Epic 1 không chỉ giúp người dùng sử dụng ngay tính năng **Phân tích câu & Tra từ chạm thông minh (Hán - Pinyin - Hán Việt - Việt)** mà còn là các khối lắp ghép (building blocks) dùng chung cho **Giáo trình Bài học (Epic 2)**, **Thống kê & Nhắc học (Epic 3)** và **Trình đọc truyện EPUB (Epic 4)**.

---

## 2. Danh sách Yêu cầu Nghiệp vụ Chi tiết (User Stories & Functional Requirements)

### FR-01.1: Khung Ứng dụng PWA SPA & Hoạt động Offline (App Shell)
* **Mô tả:** Người học mở ứng dụng trên trình duyệt máy tính hoặc điện thoại, có thể cài đặt như ứng dụng gốc (PWA) và tiếp tục sử dụng khi mất mạng.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-1.1:** Giao diện SPA có thanh điều hướng rõ ràng giữa các phân khu:
    1. `Tổng quan & Phân tích câu` (Khám phá & Tra từ thông minh)
    2. `Giáo trình & Kiểm tra` (Khung tích hợp sẵn sàng cho Epic 2)
    3. `Đọc truyện EPUB` (Khung tích hợp sẵn sàng cho Epic 4)
    4. `Sổ từ & Tiến độ 30p` (Quản lý từ đã lưu & cài đặt nhắc học)
  * **AC-1.2:** Hiển thị trạng thái kết nối mạng (`Online` / `Offline Sẵn sàng`) và chế độ chữ viết hiện tại (`Giản thể 简体` — kèm ghi chú hỗ trợ `Phồn thể 繁體` trong bản mở rộng).
  * **AC-1.3:** Cấu hình đầy đủ Web App Manifest và Service Worker cùng GitHub Actions workflow để deploy tĩnh lên GitHub Pages.

### FR-01.2: Bộ Tách Từ & Tra Cứu Chạm Thông Minh (Smart Tap-to-Translate Engine)
* **Mô tả:** Khi người học chạm/click vào một chữ bất kỳ trong đoạn văn tiếng Hoa hoặc nhập một câu/từ vào ô tra cứu, hệ thống tự động nhận diện từ/cụm từ chính xác theo ngữ cảnh.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-2.1 (Đầy đủ 4 lớp ngôn ngữ):** Hiển thị rõ ràng:
    1. **Chữ Hán Giản thể** (và chữ Phồn thể đối chiếu nếu có).
    2. **Pinyin** chuẩn thanh điệu.
    3. **Âm Hán-Việt** (viết hoa chữ cái đầu hoặc định dạng nổi bật dễ nhìn).
    4. **Nghĩa tiếng Việt** chi tiết kèm nhãn phân loại.
  * **AC-2.2 (Nhận diện đa cấp độ từ vựng):**
    * **Từ đơn (1 chữ):** vd `看` (khán - xem/đọc), `听` (thính - nghe).
    * **Từ kép (2 chữ):** vd `注册` (chú sách - đăng ký), `修炼` (tu luyện), `副本` (phó bản), `小说` (tiểu thuyết).
    * **Từ liên 3 (3 chữ):** vd `打酱油` (đi ngang qua/hóng chuyện), `破防了` (vỡ trận cảm xúc), `读卡器` (đầu đọc thẻ), `世界观` (thế giới quan).
    * **Thành ngữ / Cụm 4 chữ:** vd `莫名其妙` (mạc danh kỳ diệu - không hiểu ra sao), `一本正经` (nhất bản chính kinh - nghiêm túc đứng đắn).
    * **Tiếng lóng mạng & Thuật ngữ Game/Truyện:** vd `破防` (vỡ phòng thủ tâm lý/mủi lòng), `氪金` (nạp tiền vào game), `肝` (cày cuốc thức đêm), `吃瓜` (ăn dưa hóng drama), `开挂` (bật hack/bàn tay vàng), `满级` (max cấp).
    * **Từ có nguồn gốc tiếng Anh (Loanwords / Tech & Modern terms):** vd `卡` (`card` - thẻ / bị lag), `注册` (`register` - đăng ký), `寄存器` (`register` - thanh ghi CPU), `秀` (`show` - thể hiện/trình diễn), `粉丝` (`fans` - người hâm mộ), `酷` (`cool` - ngầu), `派对` / `趴` (`party` - bữa tiệc), `艾特` (`at @` - tag tên), `拉黑` (`blacklist/block` - chặn).
  * **AC-2.3 (Chạm vào chữ bất kỳ trong cụm vẫn nhận diện đúng cả cụm):**
    * Khi người dùng chạm vào chữ thứ 2 hoặc thứ 3 của một từ ghép (ví dụ chạm vào chữ `"册"` trong câu `"请先注册账号"` hoặc chữ `"酱"` trong `"我是来打酱油的"`), hệ thống phải tự động gom và dịch cả cụm `"注册"` / `"打酱油"` chứ không chỉ dịch rời rạc chữ `"册"` hay `"酱"`.
  * **AC-2.4 (Phân rã chữ thành phần - Constituent Breakdown):**
    * Bên dưới nghĩa của cụm từ ghép, Popover hiển thị danh sách từng chữ Hán đơn lẻ cấu thành nên cụm đó (kèm Pinyin, Âm Hán-Việt và nghĩa gốc) để người học nhớ từ cực nhanh.
  * **AC-2.5 (Nghe phát âm & Lưu từ vựng):**
    * Có nút bấm **Nghe phát âm (`zh-CN`)** qua Web Speech API và nút **Lưu vào Sổ từ vựng** (lưu offline).

### FR-01.3: Theo dõi Mục tiêu Học 30 Phút/Ngày & Nhắc học Cơ bản (Daily 30m Habit Core)
* **Mô tả:** Người học cần duy trì thói quen học tiếng Hoa tối thiểu 30 phút mỗi ngày và được nhắc nhở nếu chưa hoàn thành.
* **Tiêu chí Nghiệm thu (Acceptance Criteria):**
  * **AC-3.1:** Thanh trạng thái hiển thị bộ đếm thời gian học trong ngày hôm nay so với mục tiêu `30 phút` (1800 giây), kèm nút Tạm dừng / Tiếp tục đếm giờ và chuỗi ngày học liên tiếp (`Streak`).
  * **AC-3.2:** Dữ liệu thời gian học, danh sách từ đã lưu và cài đặt giờ nhắc học (ví dụ `20:00` mỗi ngày) được lưu bền vững offline.
  * **AC-3.3:** Khi chưa đạt 30 phút trong ngày và đến khung giờ nhắc học (hoặc người dùng kiểm tra trạng thái nhắc học), ứng dụng hiển thị thông báo nhắc nhở rõ ràng.

---

## 3. Tiêu chuẩn Chất lượng & Kiểm thử (Quality & Coverage Requirements)
* Toàn bộ mã nguồn của Epic 1 phải có bộ Unit Test và Component Integration Test tự động đạt **$\ge 90\%$ coverage** trên cả 4 chỉ số (`lines`, `statements`, `functions`, `branches`) thông qua `npm run test:coverage`.
