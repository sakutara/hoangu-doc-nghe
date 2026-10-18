# Quy trình biên soạn giáo trình (EPIC-02)

Sinh `src/data/lessons/level1..4.ts` (≈ 6.600 từ, 266 bài). Xem lý do & số liệu ở [ADR-008](../../docs/adr/ADR-008-curriculum-scale-and-data-pipeline.md).

## Chỉ cần sửa/ thêm nội dung bài?
Sửa tệp trong `gl/` rồi chạy mục "Sinh lại dữ liệu" bên dưới. Không cần tải lại kho ngữ liệu nếu bạn chỉ sửa chữ (nhưng vẫn cần `pool.json`/`plan.json`, xem mục chuẩn bị).

## Chuẩn bị (một lần)
Chạy trong thư mục này (`scripts/curriculum/`):

```bash
python3 -m venv venv && ./venv/bin/pip install pypinyin jieba
mkdir -p data/sub
# Tần suất từ phụ đề phim (SUBTLEX-CH, Cai & Brysbaert 2010) → data/sub/SUBTLEX_CH_131210_CE.utf8
curl -L -o data/subtlex.zip https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch/subtlexch131210.zip && unzip -o data/subtlex.zip -d data/sub
# Từ điển Hán-Việt (CVDICT, CC BY-SA 4.0), bảng âm Hán-Việt theo pinyin, danh sách HSK 3.0
curl -L -o data/CVDICT.u8 https://raw.githubusercontent.com/ph0ngp/CVDICT/main/CVDICT.u8
curl -L -o data/hanviet.csv https://raw.githubusercontent.com/ph0ngp/hanviet-pinyin-wordlist/main/hanviet.csv
curl -L -o data/hsk.json https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json
# CC-CEDICT đã có sẵn ở ../../public/cedict.json
./venv/bin/python cand.py && ./venv/bin/python pool.py && python3 plan.py
```
`pool.py` dựng kho ứng viên có pinyin/Hán-Việt/nháp nghĩa (`pool.json`); `plan.py` chia thành các bài `F1-01…F4-32` (25 từ/bài) và loại các từ đã nằm trong bài chủ đề.

## Định dạng `gl/*.txt`
```
## F1-03 | Tên bài (tiếng Việt)
3=cái này, này                  # bài từ danh sách tần suất: "số thứ tự từ trong bài = nghĩa Việt"
12=ồ (thán từ);;ò;;ngạc         # có thể thêm ";;pinyin;;Hán-Việt;;phồn thể" để ghi đè
5=-                              # bỏ từ này
> 我们现在可以去。 | Bây giờ chúng ta có thể đi.   # câu ví dụ: chữ Hán | bản dịch (pinyin tự sinh)
## G3-01 | Bài chủ đề (từ tự chọn)
修炼=tu luyện                   # bài chủ đề: "từ=nghĩa" (pinyin/Hán-Việt tự sinh, ghi đè bằng ";;")
```
* Tiền tố tệp: `a/b` cấp 1–2 (tần suất), `c` bài truyện mạng (G3), `d` thành ngữ (C4), `e` lóng (S4), `f` tần suất cấp 3 (F3), `g` đoạn đọc cấp 4 (F4), `h` từ ghép bổ sung (X4).
* Thứ tự trong cấp: cấp 3 = `G` rồi `F`; cấp 4 = `C`, `S`, `F`, `X`.
* `gl/hvfix.txt`: sửa âm Hán-Việt theo **từ** (`từ=âm`); sửa theo **chữ** ở `CHAR_FIX` trong `draft.py`.
* Nghĩa Việt phải **duy nhất** toàn giáo trình; mỗi từ chỉ xuất hiện một lần.

## Kiểm tra & sinh lại dữ liệu
```bash
./venv/bin/python check.py            # trùng nghĩa, thiếu Hán-Việt, câu dùng từ chưa học (--from=KEY, -q)
./venv/bin/python dupwords.py         # từ lặp giữa các bài
python3 fixgloss.py "từ=nghĩa mới" …  # sửa nhanh nghĩa của một hoặc nhiều từ
./venv/bin/python gen_ts.py           # ghi ../../src/data/lessons/*.ts
cd ../.. && npm run typecheck && npm test
```
`cov.py` tính độ phủ trên SUBTLEX-CH (hàm `cov(words)`).

## Nguồn dữ liệu
SUBTLEX-CH (nghiên cứu, ghi nguồn) · CC-CEDICT (CC BY-SA 3.0) · CVDICT (CC BY-SA 4.0) · `hanviet-pinyin-wordlist` · complete-hsk-vocabulary.
