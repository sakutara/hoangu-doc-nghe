#!/usr/bin/env python3
"""
Công cụ đóng gói bản dịch tiếng Việt thành file EPUB 3.0 hoàn chỉnh (tương thích EPUB 2.0).
Hỗ trợ trích xuất bìa từ EPUB gốc, sinh mục lục nav.xhtml + toc.ncx và kiểm tra toàn vẹn ZIP.
"""

import argparse
import html
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone

DEFAULT_CSS = """body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.8;
  margin: 1.2em 1em;
  color: #222;
}
h1 {
  font-size: 1.45em;
  text-align: center;
  margin-top: 1.2em;
  margin-bottom: 1.5em;
  color: #111;
  font-weight: 700;
}
p {
  margin: 0.8em 0;
  text-indent: 1.8em;
  text-align: justify;
}
nav ol {
  line-height: 2.2;
  font-size: 1.05em;
}
nav a {
  text-decoration: none;
  color: #1a56db;
}
"""


def make_chapter_xhtml(title: str, paragraphs: list[str]) -> str:
    esc_title = html.escape(title)
    p_tags = "\n".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">
<head>
<meta charset="utf-8"/>
<title>{esc_title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<h1>{esc_title}</h1>
{p_tags}
</body>
</html>"""


def build_epub(
    source_epub: str,
    chapters_data: list[dict],
    book_title: str,
    author: str,
    output_epub: str,
    description: str = "",
):
    """
    chapters_data: [{"title": "Chương 1: ...", "paragraphs": ["Đoạn 1...", "Đoạn 2..."]}, ...]
    """
    book_uid = f"vi-epub-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with tempfile.TemporaryDirectory() as tmpdir:
        oebps_dir = os.path.join(tmpdir, "OEBPS")
        meta_dir = os.path.join(tmpdir, "META-INF")
        os.makedirs(oebps_dir, exist_ok=True)
        os.makedirs(meta_dir, exist_ok=True)

        # 1. mimetype
        mimetype_path = os.path.join(tmpdir, "mimetype")
        with open(mimetype_path, "w", encoding="utf-8") as f:
            f.write("application/epub+zip")

        # 2. container.xml
        container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
        with open(os.path.join(meta_dir, "container.xml"), "w", encoding="utf-8") as f:
            f.write(container_xml)

        # 3. Trích xuất ảnh bìa từ EPUB gốc (nếu có)
        has_cover = False
        if source_epub and os.path.exists(source_epub):
            with zipfile.ZipFile(source_epub, "r") as z:
                for name in z.namelist():
                    if name.endswith(("cover.jpg", "cover.jpeg", "cover.png")):
                        with open(os.path.join(oebps_dir, "cover.jpg"), "wb") as cf:
                            cf.write(z.read(name))
                        has_cover = True
                        break

        # 4. style.css
        with open(os.path.join(oebps_dir, "style.css"), "w", encoding="utf-8") as f:
            f.write(DEFAULT_CSS)

        # 5. cover.xhtml
        if has_cover:
            cover_xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">
<head>
<meta charset="utf-8"/>
<title>{html.escape(book_title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<div style="text-align:center; padding: 1em 0;">
  <img src="cover.jpg" alt="{html.escape(book_title)}" style="max-width:100%; height:auto; max-height:85vh;"/>
</div>
</body>
</html>"""
            with open(os.path.join(oebps_dir, "cover.xhtml"), "w", encoding="utf-8") as f:
                f.write(cover_xhtml)

        # 6. Ghi các file chương ch0001.xhtml ...
        titles_meta = []
        for idx, ch in enumerate(chapters_data, 1):
            fname = f"ch{idx:04d}.xhtml"
            ch_title = ch["title"]
            ch_paras = ch["paragraphs"]
            with open(os.path.join(oebps_dir, fname), "w", encoding="utf-8") as f:
                f.write(make_chapter_xhtml(ch_title, ch_paras))
            titles_meta.append((fname, ch_title))

        # 7. nav.xhtml (EPUB 3)
        nav_items = "\n".join(
            f'<li><a href="{href}">{html.escape(t)}</a></li>' for href, t in titles_meta
        )
        nav_xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">
<head>
<meta charset="utf-8"/>
<title>Mục lục - {html.escape(book_title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<nav epub:type="toc">
<h1>Mục lục</h1>
<ol>
{nav_items}
</ol>
</nav>
</body>
</html>"""
        with open(os.path.join(oebps_dir, "nav.xhtml"), "w", encoding="utf-8") as f:
            f.write(nav_xhtml)

        # 8. toc.ncx (EPUB 2)
        ncx_points = "\n".join(
            f"""<navPoint id="n{i}" playOrder="{i}">
  <navLabel><text>{html.escape(t)}</text></navLabel>
  <content src="{href}"/>
</navPoint>"""
            for i, (href, t) in enumerate(titles_meta, 1)
        )
        toc_ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
  <meta name="dtb:uid" content="{book_uid}"/>
  <meta name="dtb:depth" content="1"/>
  <meta name="dtb:totalPageCount" content="0"/>
  <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>{html.escape(book_title)}</text></docTitle>
<docAuthor><text>{html.escape(author)}</text></docAuthor>
<navMap>
{ncx_points}
</navMap>
</ncx>"""
        with open(os.path.join(oebps_dir, "toc.ncx"), "w", encoding="utf-8") as f:
            f.write(toc_ncx)

        # 9. content.opf
        manifest_chapters = "\n  ".join(
            f'<item id="c{i}" href="{href}" media-type="application/xhtml+xml"/>'
            for i, (href, _) in enumerate(titles_meta, 1)
        )
        spine_chapters = "\n  ".join(
            f'<itemref idref="c{i}"/>' for i in range(1, len(titles_meta) + 1)
        )
        cover_meta = '<meta name="cover" content="cover-image"/>' if has_cover else ""
        cover_manifest = (
            '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n  '
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'
            if has_cover
            else ""
        )
        cover_spine = '<itemref idref="cover" linear="no"/>' if has_cover else ""

        content_opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2005/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">{book_uid}</dc:identifier>
  <dc:title>{html.escape(book_title)}</dc:title>
  <dc:creator>{html.escape(author)}</dc:creator>
  <dc:language>vi</dc:language>
  <dc:description>{html.escape(description or f"Bản dịch tiếng Việt của {book_title}")}</dc:description>
  <meta property="dcterms:modified">{now_iso}</meta>
  {cover_meta}
</metadata>
<manifest>
  <item id="style" href="style.css" media-type="text/css"/>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  {cover_manifest}
  {manifest_chapters}
</manifest>
<spine toc="ncx">
  {cover_spine}
  {spine_chapters}
</spine>
</package>"""
        with open(os.path.join(oebps_dir, "content.opf"), "w", encoding="utf-8") as f:
            f.write(content_opf)

        # 10. Đóng gói ZIP chuẩn EPUB
        if os.path.exists(output_epub):
            os.remove(output_epub)
        with zipfile.ZipFile(output_epub, "w") as z:
            z.write(mimetype_path, "mimetype", compress_type=zipfile.ZIP_STORED)
            for folder in ("META-INF", "OEBPS"):
                folder_path = os.path.join(tmpdir, folder)
                for root, _dirs, files in os.walk(folder_path):
                    for file in sorted(files):
                        full_p = os.path.join(root, file)
                        rel_p = os.path.relpath(full_p, tmpdir)
                        z.write(full_p, rel_p, compress_type=zipfile.ZIP_DEFLATED)

    # Kiểm tra toàn vẹn
    with zipfile.ZipFile(output_epub, "r") as z:
        err = z.testzip()
        if err is not None:
            raise RuntimeError(f"Lỗi hỏng file trong gói EPUB: {err}")

    print(
        f"[OK] Đã xuất thành công: {output_epub} "
        f"({len(chapters_data)} chương, {os.path.getsize(output_epub):,} bytes)"
    )


def main():
    parser = argparse.ArgumentParser(description="Đóng gói bản dịch thành EPUB tiếng Việt")
    parser.add_argument("--source", default="", help="Đường dẫn tới file EPUB gốc (để lấy ảnh bìa)")
    parser.add_argument("--chapters-json", required=True, help="File JSON chứa danh sách các chương đã dịch")
    parser.add_argument("--title", required=True, help="Tên sách tiếng Việt")
    parser.add_argument("--author", default="Khuyết danh", help="Tên tác giả")
    parser.add_argument("--description", default="", help="Mô tả ngắn về sách")
    parser.add_argument("--output", required=True, help="Đường dẫn file .epub xuất ra")
    args = parser.parse_args()

    with open(args.chapters_json, "r", encoding="utf-8") as f:
        chapters_data = json.load(f)

    build_epub(
        source_epub=args.source,
        chapters_data=chapters_data,
        book_title=args.title,
        author=args.author,
        output_epub=args.output,
        description=args.description,
    )


if __name__ == "__main__":
    main()
