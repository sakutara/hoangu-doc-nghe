#!/usr/bin/env python3
"""
Công cụ kiểm tra cấu trúc EPUB tiếng Hoa, phát hiện lỗi lặp/đảo đoạn (hetushu)
và tra cứu từ vựng tiếng Việt hiện đại từ dự án chinese-study (cedict.json).
"""

import argparse
import json
import os
import re
import zipfile
from collections import Counter

DEFAULT_CEDICT_PATH = "/Users/sakutara/Work/chinese-study/public/cedict.json"


def load_dictionary(dict_path: str) -> dict[str, tuple[str, str]]:
    """Tải cedict.json từ project chinese-study: trả về map {simplified: (pinyin, meaning)}."""
    if not os.path.exists(dict_path):
        print(f"[Cảnh báo] Không tìm thấy từ điển tại: {dict_path}")
        return {}
    with open(dict_path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    vocab = {}
    for row in rows:
        if len(row) >= 4:
            simp, _trad, pinyin, meaning = row[0], row[1], row[2], row[3]
            if simp not in vocab:
                vocab[simp] = (pinyin, meaning)
    return vocab


def extract_chapters(z: zipfile.ZipFile) -> list[str]:
    """Lấy danh sách các file chương XHTML theo thứ tự."""
    html_files = [
        n for n in z.namelist()
        if n.endswith((".xhtml", ".html", ".htm"))
        and not os.path.basename(n).startswith(("cover", "nav", "toc"))
    ]
    return sorted(html_files)


def check_epub(epub_path: str):
    """Kiểm tra tổng quan cấu trúc, số chương, câu lặp và watermark chống cào."""
    with zipfile.ZipFile(epub_path, "r") as z:
        chapters = extract_chapters(z)
        print(f"=== KIỂM TRA EPUB: {os.path.basename(epub_path)} ===")
        print(f"Tổng số file chương: {len(chapters)}")

        total_repeated = 0
        total_watermarks = 0
        sample_inspect = chapters[:10]

        for ch in sample_inspect:
            html = z.read(ch).decode("utf-8", errors="replace")
            paras = re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL)
            counts = Counter(paras)
            reps = {p: c for p, c in counts.items() if c > 1}
            rep_count = sum(c - 1 for c in counts.values() if c > 1)
            wm_count = len(re.findall(r"和[*\-|]图[*\-|]书", html))

            total_repeated += rep_count
            total_watermarks += wm_count

            title_m = re.search(r"<title>(.*?)</title>", html)
            title = title_m.group(1) if title_m else ch
            print(
                f"  - {ch} ({title}): {len(paras)} đoạn | "
                f"Câu lặp dư: {rep_count} | Watermark: {wm_count}"
            )
            if reps:
                for p, c in list(reps.items())[:2]:
                    print(f"      [Lặp {c}x]: {p[:45]}...")

        if total_repeated > 0 or total_watermarks > 0:
            print(
                f"\n[!] CẢNH BÁO CHỐNG CÀO: Phát hiện {total_repeated} đoạn lặp và {total_watermarks} watermark "
                "trong 10 chương đầu. KHÔNG tự ý khôi phục nguyên tác — hãy dừng lại và báo ngay cho người dùng!"
            )
        else:
            print("\n[OK] Không phát hiện câu lặp rác hay watermark trong các chương kiểm tra.")


def lookup_chapter_terms(epub_path: str, chapter_idx: int, dict_path: str):
    """Đọc nội dung 1 chương và đối chiếu các từ vựng đáng chú ý từ chinese-study."""
    vocab = load_dictionary(dict_path)
    with zipfile.ZipFile(epub_path, "r") as z:
        chapters = extract_chapters(z)
        if chapter_idx < 1 or chapter_idx > len(chapters):
            raise ValueError(f"Chương {chapter_idx} nằm ngoài phạm vi (1..{len(chapters)})")

        ch_file = chapters[chapter_idx - 1]
        html = z.read(ch_file).decode("utf-8", errors="replace")
        title_m = re.search(r"<title>(.*?)</title>", html)
        title = title_m.group(1) if title_m else ch_file
        paras = [re.sub(r"<[^>]+>", "", p).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL)]

        print(f"=== CHƯƠNG {chapter_idx}: {title} ({ch_file}) ===")
        print(f"Số đoạn văn: {len(paras)}\n")
        for i, p in enumerate(paras, 1):
            print(f"[{i}] {p}")

        if vocab:
            full_text = "\n".join(paras)
            matched = {}
            # Quét các cụm từ 2-4 chữ xuất hiện trong từ điển chinese-study
            for length in (4, 3, 2):
                for idx in range(len(full_text) - length + 1):
                    sub = full_text[idx : idx + length]
                    if sub in vocab and sub not in matched:
                        matched[sub] = vocab[sub]
            print(f"\n=== GỢI Ý TỪ ĐIỂN CHINESE-STUDY ({len(matched)} từ ghép khớp) ===")
            for word, (pinyin, meaning) in list(matched.items())[:60]:
                print(f"  • {word} [{pinyin}]: {meaning}")


def main():
    parser = argparse.ArgumentParser(description="Kiểm tra EPUB & tra từ điển chinese-study")
    parser.add_argument("epub", help="Đường dẫn tới file .epub tiếng Hoa")
    parser.add_argument("--check", action="store_true", help="Kiểm tra cấu trúc, câu lặp và watermark")
    parser.add_argument("--chapter", type=int, help="Trích xuất văn bản và tra từ điển cho chương thứ N (bắt đầu từ 1)")
    parser.add_argument("--dict", default=DEFAULT_CEDICT_PATH, help="Đường dẫn tới cedict.json")
    args = parser.parse_args()

    if args.check or not args.chapter:
        check_epub(args.epub)
    if args.chapter:
        lookup_chapter_terms(args.epub, args.chapter, args.dict)


if __name__ == "__main__":
    main()
