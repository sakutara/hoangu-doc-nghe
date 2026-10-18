# Solution Architecture — EPIC-03: Tiến độ, SRS & Nhắc học

* **Liên kết:** [BR-EPIC-03](BR-EPIC-03.md) | [SA-MASTER](../../SA-MASTER.md) | [ADR-007](../../adr/ADR-007-srs-scheduler-and-progress-analytics.md)

## 1. Module
### 1.1 `src/domains/srs/SrsScheduler.ts` (thuần, không I/O)
```ts
type SrsGrade = 'again' | 'hard' | 'good' | 'easy';
interface SrsCard { simplified: string; box: number; dueDate: string; reps: number; lapses: number; addedDate: string; lastReviewed?: string }
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // ngày; MASTERED_BOX = 4 (>= 14 ngày)
```
* `addDays(dateStr, n)`; `newCard(word, today)` (box 0, đến hạn ngay).
* `reviewCard(card, grade, today)`: `again` → box 0, `lapses+1`, đến hạn hôm nay; `hard` → giữ box, hạn `max(1, floor(interval/2))` ngày; `good` → box+1; `easy` → box+2 (chặn ở box cuối); `reps+1`, `lastReviewed = today`.
* `syncCards(cards, words, today)`: thêm thẻ cho từ mới, bỏ thẻ của từ đã xóa, giữ nguyên thẻ còn lại.
* `dueCards(cards, today, limit)`: thẻ có `dueDate <= today`, sắp theo hạn rồi box; `srsStats(cards, today)` → `{ total, due, mastered, nextDue? }`.

### 1.2 `src/domains/tracker/ProgressAnalytics.ts`
* `lastNDays(records, today, n, goalMinutes)` → `{date, seconds, goalCompleted}[]` cũ → mới (ngày thiếu = 0).
* `longestStreak(records)`; `summarizeStudy(records, today, goalMinutes)` → `{ totalSeconds, activeDays, goalDays, streak, longestStreak }`. `goalDays` tính theo mục tiêu hiện hành.

### 1.3 `src/domains/tracker/ReminderService.ts`
```ts
interface ReminderState { date: string; snoozedUntil?: string; dismissed?: boolean }
```
* `isReminderVisible(record, settings, hhmm, state, today)`: dựa trên `shouldTriggerDailyReminder` (Epic 1) rồi loại trừ khi `state.date === today` và (`dismissed` hoặc `hhmm < snoozedUntil`).
* `snoozeUntil(hhmm, minutes)` → `HH:MM` (chặn ở `23:59`).
* `showSystemNotification(minutes, goal)`: adapter bọc `Notification`, trả `false` khi thiếu API / chưa cấp quyền.

## 2. Lưu trữ (`StorageService`, localStorage)
`srs_cards` (`getSrsCards/saveSrsCards`), `reminder_state` (`getReminderState/saveReminderState`), `syncSrs(today)` = đọc sổ từ + thẻ, `syncCards`, lưu nếu đổi, trả thẻ. `HabitSettings.dailyGoalMinutes` được UI chỉnh (giới hạn 1–240).

## 3. UI
* `ProgressPage` (`#/progress`, tab “Tiến độ”): thẻ số liệu, biểu đồ cột 7/30 ngày (div + `role="img"` có aria-label), danh sách bài theo cấp, tóm tắt SRS và liên kết sang `#/review`.
* `ReviewPage` (`#/review`, tab “Ôn từ”): chọn chế độ Đọc/Nghe, hàng đợi trong state, lật thẻ, 4 nút chấm, thẻ “Quên” đẩy về cuối hàng đợi, lưu thẻ sau mỗi lần chấm (per-card commit, không mất tiến độ).
* `VocabularyAndHabitPage`: thêm ô mục tiêu phút/ngày, hiển thị hộp & hạn ôn từng từ, liên kết sang ôn tập.
* `DailyStudyHeader`: đọc settings mỗi lần render (đổi mục tiêu có hiệu lực ngay); banner thêm nút nhắc lại/bỏ qua; thông báo hệ thống bắn qua `showSystemNotification` khi banner hiện.

## 4. Kiểm thử
`srs.test.ts` (lịch ôn, sync, thống kê), `progressAnalytics.test.ts`, `reminder.test.ts`, `epic3Ui.test.tsx` (Progress, Review hai chế độ, vocab/goal, snooze/dismiss), cập nhật `appIntegration.test.tsx`. Coverage gate ≥ 90% giữ nguyên.
