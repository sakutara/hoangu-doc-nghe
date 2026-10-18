# Solution Architecture — EPIC-02: Giáo trình, Bài học & Quiz

* **Liên kết:** [BR-EPIC-02](BR-EPIC-02.md) | [SA-MASTER](../../SA-MASTER.md)
* **ADRs:** ADR-001, ADR-002, ADR-003, ADR-004 (mô hình dữ liệu có `simplified`/`traditional?`), [ADR-008](../../adr/ADR-008-curriculum-scale-and-data-pipeline.md) (quy mô giáo trình & quy trình sinh dữ liệu)

## 1. Module (`src/domains/curriculum/`, `src/data/curriculum.ts`, `src/data/lessons/`)
```ts
interface VocabItem { simplified: string; traditional?: string; pinyin: string; hanViet: string; meaning: string }
interface LessonLine { zh: string; pinyin: string; vi: string }
interface Lesson { id: string; level: 1|2|3|4; order: number; title: string; vocab: VocabItem[]; lines: LessonLine[] }
type QuizKind = 'listen_meaning' | 'hanzi_to_viet' | 'viet_to_hanzi' | 'read_translation'
interface QuizQuestion { id: string; kind: QuizKind; prompt: string; audioText?: string; options: string[]; answerIndex: number }
interface LessonProgress { bestScore: number; completed: boolean; attempts: number }
```
* **Dữ liệu:** `src/data/lessons/level{1..4}.ts` (sinh tự động, mỗi bài là một lời gọi `lesson(id, level, order, title, vocabRows, lineRows)` ở `helpers.ts`; hàng từ vựng dạng tuple `[giản thể, pinyin, Hán-Việt, nghĩa Việt, phồn thể?]`). `src/data/curriculum.ts` ghép `LESSONS = [...LEVEL_1..4]` và giữ `LEVEL_TITLES`. Id bài là `l{cấp}-{thứ tự trong cấp}`; thứ tự mở khóa theo `(level, order)`.
* **Quy mô hiện tại:** 266 bài / 6.581 từ / 2.262 chữ / 1.128 câu (≈ 590 KB mã nguồn TS ≈ 230 KB gzip; bundle chính 970 KB / 359 KB gzip; service worker cũng gói dữ liệu này vì bộ dịch nền dùng `defaultSegmenter`; toàn bộ được precache nên dùng offline).
* `generateQuiz(lesson, allLessons = [lesson], rng = Math.random, seen = [])`: lấy ngẫu nhiên `QUIZ_SIZE = 12` mục của bài (≤ 2 câu `read_translation`, còn lại từ vựng với dạng `listen_meaning`/`hanzi_to_viet`/`viet_to_hanzi` chọn ngẫu nhiên), ưu tiên mục có id chưa nằm trong `seen`, trộn thứ tự. `updateSeen(lesson, seen, questions)` trả danh sách id đã ra; hết mục thì sang vòng mới. `StorageService.getQuizSeen/saveQuizSeen(lessonId)` lưu vào localStorage `quiz_seen`; `LessonPage` gọi mỗi lần `round` đổi. Đáp án và distractor chỉ là nghĩa Việt hoặc chữ Hán; pinyin/Hán-Việt không bao giờ xuất hiện trong câu hỏi hay đáp án. **Distractor lấy ưu tiên từ chính bài (`near`), thiếu thì bổ sung từ các bài khác cùng cấp (`far`, loại bài đang làm bằng so sánh tham chiếu)**; loại trùng; xáo trộn Fisher–Yates bằng `rng` truyền vào (test xác định). Cách chọn gần-trước-xa-sau giữ độ khó hợp lý khi kho từ lên tới hàng nghìn.
* `scoreQuiz(questions, answers)` → `{ correct, total, percent, passed }`, ngưỡng `PASS_PERCENT = 80`.
* `CurriculumProgress`: `isLessonUnlocked(lessons, progress, id)`, `recordAttempt(progress, id, percent)`, `completionPercent(lessons, progress)`, `nextLesson`; thứ tự mở khóa theo `(level, order)` xuyên cấp.

## 2. Lưu trữ
`StorageService.getLessonProgress()/saveLessonProgress()` — localStorage khóa `lesson_progress` (bảng `user_progress` trong thiết kế). Khóa theo id bài; id đổi so với phiên bản 8 bài cũ (`l1-1`, `l1-2`, `l2-1`… vẫn là id hợp lệ nhưng nay trỏ tới nội dung mới).

## 3. UI
* `LessonsPage`: một `<details>` cho mỗi cấp (mở sẵn cấp đang học), tiêu đề cấp kèm `x/y bài`, mỗi dòng "Bài n — tên bài", trạng thái 🔒/✔/mở, điểm tốt nhất; thanh % tổng và dòng thống kê tổng số bài/từ.
* `LessonPage` (`#/lesson/:id`): tab Từ vựng · Đọc/Nghe · Kiểm tra; đoạn đọc dùng `InteractiveChineseText`; `QuizRunner` (component) chạy từng câu, chấm, hiện kết quả và nút Làm lại / Bài kế tiếp. Truy cập bài khóa qua URL → chuyển về danh sách.
* `ProgressPage`: danh sách điểm từng bài gom theo cấp trong `<details>`.

## 4. Từ điển & dịch chạm
`defaultSegmenter` nạp `CORE_LEXICON` rồi **mọi từ vựng của bài học** (`lessonEntries`), nên mọi từ trong giáo trình đều tra được offline; câu ví dụ chỉ dùng từ/chữ đã có trong giáo trình (test kiểm tra từng token). Dữ liệu CC-CEDICT nạp lười (Epic 1) lo phần ngoài giáo trình khi đọc truyện.

## 5. Kiểm thử
* `curriculum.test.ts`: dữ liệu hợp lệ (≥ 4 cấp, mỗi bài đủ từ & câu, id/thứ tự liền mạch `l{cấp}-{n}`), quy mô (≥ 250 bài, ≥ 6.000 từ, mỗi cấp ≥ 50 bài), **mỗi từ xuất hiện một lần và nghĩa Việt duy nhất**, Hán-Việt không còn `?`; quiz (4 đáp án duy nhất, đúng đáp án, xáo trộn, không lộ pinyin/Hán-Việt); chấm điểm; mở khóa (kể cả qua cấp).
* `curriculumCoverage.test.ts` + `tests/fixtures/subtlex-top12000.json`: độ phủ ≥ 90% lượt từ (nguyên từ), ≥ 97% (cả từ ghép đã biết mọi chữ), ≥ 97% của 3.000 từ đầu bảng tần suất.
* `lessonsUi.test.tsx` (khóa/mở, làm bài đạt/không đạt, mở khóa bài kế, lưu tiến độ, bài cuối không có "Bài kế tiếp"), `smartSegmenter.test.ts` (mọi từ và mọi token trong câu ví dụ đều tra được).

## 6. Quy trình biên soạn nội dung
Xem [ADR-008](../../adr/ADR-008-curriculum-scale-and-data-pipeline.md) và `scripts/curriculum/README.md`: nguồn biên soạn nằm ở `scripts/curriculum/gl/*.txt`; script Python sinh pinyin/Hán-Việt, kiểm tra trùng nghĩa/trùng từ, rồi sinh `src/data/lessons/*.ts`.
