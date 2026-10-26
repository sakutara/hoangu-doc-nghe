/* Logic thuần (không đụng chrome.*): trích nội dung chương, link “下一章”, mục lục, nhận diện trang kiểm tra bot, dọn nội dung, đọc/ghi EPUB.
 * Nạp như classic script → gắn vào globalThis.HNCore. Dùng cùng bộ chọn với bookmarklet của app (ADR-009). */
(function (root) {
  const NEXT_RE = /下一章|下一页|下章|下一节/;
  const TOC_RE = /目录|目錄|章节列表|章節列表/;
  const CHAPTER_TITLE_RE = /第.{1,9}[章节節回卷]|^\s*\d+\s*[.、]|^\s*chapter\s*\d+/i;
  const CHALLENGE_RE = /Just a moment|cf-chl|challenge-form|challenges\.cloudflare\.com|captcha|验证码|人机验证|verify you are human|unusual traffic/i;
  const SELECTORS = ['#content', '#chaptercontent', '.Readarea', '.chapter-content', 'article'];
  const SKIP_RE = /^(script|style|iframe|noscript)$/i;
  const BLOCK_RE = /^(p|div|li|section|article|ul|ol|blockquote|tr)$/i;
  const HEAD_RE = /^h[1-6]$/i;

  // ---------- dọn nội dung ----------
  const URL_CHARS = "A-Za-z0-9\\-._~:/?#@!$&'*+,;=%\\[\\]()";
  const URL_RE = new RegExp(`https?://[${URL_CHARS}]*`, 'gi');
  const SEMI_MARK = '\u0001';

  /** Bỏ MỌI khoảng trắng (kể cả全角, xuống dòng), chỉ giữ khoảng trắng ngay sau dấu chấm phẩy ; hoặc ；(gộp thành 1 dấu cách). */
  function squeezeSpaces(text) {
    return text.replace(/([;；])\s+/g, `$1${SEMI_MARK}`).replace(/\s+/g, '').split(SEMI_MARK).join(' ');
  }

  /** Dọn link chèn: URL http(s), rồi MỌI “hetushu”, MỌI “.com” (và “www.” còn sót) — gọi SAU khi đã bỏ khoảng trắng. */
  function stripLinks(text) {
    return text.replace(URL_RE, '').replace(/hetushu/gi, '').replace(/\.com/gi, '').replace(/www\./gi, '');
  }

  /** Quy trình xử lý nội dung truyện: bỏ khoảng trắng trước, dọn link sau. */
  const cleanText = (text) => stripLinks(squeezeSpaces(text));

  const han = (s) => (s.match(/[一-鿿]/g) || []).length;

  function blocksOf(rootEl) {
    const out = [];
    let buf = '';
    const flush = () => {
      buf.split('\n').forEach((l) => {
        const t = cleanText(l);
        if (t) out.push({ tag: 'p', text: t });
      });
      buf = '';
    };
    const walk = (n) => {
      if (n.nodeType === 3) { buf += n.nodeValue || ''; return; }
      if (n.nodeType !== 1) return;
      const name = n.tagName;
      if (SKIP_RE.test(name) || (n.matches && n.matches('.ads,.bottem'))) return;
      if (name.toUpperCase() === 'BR') { buf += '\n'; return; }
      if (HEAD_RE.test(name)) {
        flush();
        const t = cleanText(n.textContent || '');
        if (t) out.push({ tag: name.toLowerCase(), text: t });
        return;
      }
      const isBlock = BLOCK_RE.test(name);
      if (isBlock) flush();
      n.childNodes.forEach(walk);
      if (isBlock) flush();
    };
    rootEl.childNodes.forEach(walk);
    flush();
    return out;
  }

  function pickContent(d) {
    for (const sel of SELECTORS) {
      const el = d.querySelector(sel);
      if (el && han(el.textContent || '') > 0) return el;
    }
    let cur = null;
    let best = 0;
    d.querySelectorAll('div,section').forEach((el) => {
      const s = han(el.textContent || '');
      if (s > best) { best = s; cur = el; }
    });
    let node = cur;
    while (node) {
      const here = han(node.textContent || '');
      let deeper = null;
      node.querySelectorAll(':scope > div,:scope > section').forEach((c) => {
        if (han(c.textContent || '') >= here * 0.8) deeper = c;
      });
      if (!deeper) break;
      node = deeper;
    }
    return node;
  }

  const stripHash = (u) => u.split('#')[0];

  function isTocUrl(next, page) {
    return next.href === page.href || next.pathname.endsWith('/') || /index\.html?$/i.test(next.pathname);
  }

  function findAnchor(d, re, withRel) {
    const links = d.querySelectorAll('a[href]');
    for (let i = 0; i < links.length; i += 1) {
      const a = links[i];
      if (re.test(a.textContent || '') || (withRel && (a.getAttribute('rel') || '').toLowerCase() === 'next')) return a;
    }
    return null;
  }

  function isChallengeHtml(html) { return CHALLENGE_RE.test(html.slice(0, 20000)); }

  /** @returns {{title:string,paragraphs:string[],blocks:Array,next?:string,challenge?:boolean}} */
  function extractPage(d, pageUrl) {
    const full = d.documentElement ? d.documentElement.outerHTML : '';
    const el = pickContent(d);
    const all = el ? blocksOf(el) : [];
    if (!all.length && isChallengeHtml(full)) return { title: '', paragraphs: [], blocks: [], challenge: true };
    const inner = all.filter((b) => b.tag !== 'p' && b.tag < 'h4')[0];
    const h = d.querySelector('h1') || d.querySelector('h2');
    const title = stripLinks(((inner && inner.text) || (h && h.textContent) || d.title || '').replace(/\s+/g, ' ').trim()).trim();
    const blocks = all.filter((b) => b.text !== title && b.text !== squeezeSpaces(title));
    let next;
    const a = d.querySelector('a#next') || d.querySelector('#next a') || findAnchor(d, NEXT_RE, true);
    if (a) {
      try {
        const page = new URL(pageUrl);
        const n = new URL(a.getAttribute('href') || '', page);
        if (n.origin === page.origin && !isTocUrl(n, page)) next = n.href;
      } catch (e) { /* link hỏng */ }
    }
    return { title, paragraphs: blocks.map((b) => b.text), blocks, next };
  }

  /** URL mục lục của trang chương (link “目录”), nếu có. */
  function findTocUrl(d, pageUrl) {
    const a = findAnchor(d, TOC_RE, false);
    if (!a) return null;
    try { return stripHash(new URL(a.getAttribute('href') || '', pageUrl).href); } catch (e) { return null; }
  }

  /** Danh sách chương [{title,url}] từ trang mục lục, theo thứ tự xuất hiện, bỏ trùng URL. */
  function parseToc(d, tocUrl) {
    const base = new URL(tocUrl);
    const items = [];
    const seen = new Set();
    const push = (a) => {
      let u;
      try { u = new URL(a.getAttribute('href') || '', base); } catch (e) { return; }
      if (u.origin !== base.origin || u.href === base.href) return;
      const href = stripHash(u.href);
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!title || seen.has(href)) return;
      seen.add(href);
      items.push({ title, url: href });
    };
    const anchors = [...d.querySelectorAll('a[href]')];
    anchors.filter((a) => CHAPTER_TITLE_RE.test((a.textContent || '').trim())).forEach(push);
    if (items.length >= 3) return items;
    // Dự phòng: nhóm link cùng khối cha lớn nhất (tiêu đề chương không theo mẫu “第N章”).
    const groups = new Map();
    anchors.forEach((a) => {
      const g = a.parentElement && a.parentElement.parentElement;
      if (g) groups.set(g, (groups.get(g) || []).concat(a));
    });
    let best = [];
    groups.forEach((list) => { if (list.length > best.length) best = list; });
    if (best.length < 5) return items;
    items.length = 0; seen.clear();
    best.forEach(push);
    return items;
  }

  /** Trang mục lục? Nhiều link tiêu đề chương, hoặc (không có khối nội dung rõ ràng) một nhóm link lớn.
   *  Không dựa vào “có chữ Hán nhiều” vì mục lục cũng toàn chữ Hán. */
  function looksLikeToc(d, pageUrl) {
    const pattern = [...d.querySelectorAll('a[href]')].filter((a) => CHAPTER_TITLE_RE.test((a.textContent || '').trim())).length;
    if (pattern >= 8) return true;
    const strict = SELECTORS.some((sel) => { const e = d.querySelector(sel); return e && han(e.textContent || '') > 100; });
    return !strict && parseToc(d, pageUrl).length >= 5;
  }

  /** Tên sách: phần tiêu đề tab không phải tên chương. */
  function guessBookTitle(docTitle, chapterTitle) {
    const parts = docTitle.split(/[-_|—·]/).map((s) => s.trim()).filter(Boolean);
    const pick = parts.filter((p) => p !== chapterTitle && !/第.{1,9}[章节節回]/.test(p))[0];
    return pick || parts[0] || chapterTitle || 'Truyện';
  }

  const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'truyen';

  // ---------- ZIP tối giản (chỉ ghi kiểu “store”; đọc được cả deflate) ----------
  const CRC_TABLE = (() => {
    const tb = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      tb[n] = c >>> 0;
    }
    return tb;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const utf8 = (s) => new TextEncoder().encode(s);

  /** @param {Array<{name:string,data:Uint8Array}>} entries @returns {Uint8Array} */
  function zipStore(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    entries.forEach((e) => {
      const name = utf8(e.name);
      const crc = crc32(e.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
      local.setUint32(14, crc, true); local.setUint32(18, e.data.length, true); local.setUint32(22, e.data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, e.data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, e.data.length, true); cen.setUint32(24, e.data.length, true);
      cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + e.data.length;
    });
    const cenSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
    let p = 0;
    all.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }

  async function inflateRaw(data) {
    const stream = new Response(data).body.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Đọc ZIP → Map tên → hàm async trả Uint8Array. */
  function zipRead(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Không phải file ZIP/EPUB hợp lệ.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    for (let n = 0; n < count; n += 1) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('EPUB hỏng (central directory).');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
      files.set(name, async () => {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const raw = bytes.subarray(start, start + csize);
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error(`EPUB dùng kiểu nén ${method} chưa hỗ trợ.`);
      });
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }

  // ---------- EPUB ----------
  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  const pad = (n) => String(n).padStart(4, '0');

  /** Dựng EPUB 3 từ các chương. Mỗi chương ghi lại URL gốc ở thuộc tính data-hn-url của <body> để nhập lại đúng mục lục.
   *  @param {{title:string,bookKey?:string,origin?:string,cover?:{mime:string,data:Uint8Array}|null,chapters:Array<{url:string,title:string,blocks?:Array,paragraphs:string[]}>}} book */
  function buildEpub(book) {
    const cover = book.cover && IMG_EXT[book.cover.mime] ? book.cover : null;
    const css = 'body{line-height:1.7}h1,h2,h3{text-align:center}p{margin:.6em 0;text-indent:2em}';
    const xhtml = (title, body, attr) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh"><head><meta charset="utf-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body${attr || ''}>${body}</body></html>`;
    const entries = [
      { name: 'mimetype', data: utf8('application/epub+zip') },
      { name: 'META-INF/container.xml', data: utf8('<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
      { name: 'OEBPS/style.css', data: utf8(css) },
    ];
    const manifest = ['<item id="style" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'];
    const spine = [];
    if (cover) {
      const img = `cover.${IMG_EXT[cover.mime]}`;
      entries.push({ name: `OEBPS/${img}`, data: cover.data });
      entries.push({ name: 'OEBPS/cover.xhtml', data: utf8(xhtml(book.title, `<div style="text-align:center"><img src="${img}" alt="${xmlEsc(book.title)}" style="max-width:100%;max-height:100%"/></div>`)) });
      manifest.push(`<item id="cover-image" href="${img}" media-type="${cover.mime}" properties="cover-image"/>`, '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="cover" linear="no"/>');
    }
    const navItems = [];
    const ncxPoints = [];
    book.chapters.forEach((c, i) => {
      const file = `ch${pad(i + 1)}.xhtml`;
      const blocks = c.blocks && c.blocks.length ? c.blocks : (c.paragraphs || []).map((text) => ({ tag: 'p', text }));
      const body = `<h1>${xmlEsc(c.title)}</h1>${blocks.map((b) => `<${b.tag}>${xmlEsc(b.text)}</${b.tag}>`).join('')}`;
      entries.push({ name: `OEBPS/${file}`, data: utf8(xhtml(c.title, body, ` data-hn-url="${xmlEsc(c.url || '')}"`)) });
      manifest.push(`<item id="c${i + 1}" href="${file}" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="c${i + 1}"/>`);
      navItems.push(`<li><a href="${file}">${xmlEsc(c.title)}</a></li>`);
      ncxPoints.push(`<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEsc(c.title)}</text></navLabel><content src="${file}"/></navPoint>`);
    });
    const uid = `hoangu-${crc32(utf8(book.bookKey || book.title)).toString(16)}`;
    entries.push({ name: 'OEBPS/nav.xhtml', data: utf8(xhtml(book.title, `<nav epub:type="toc"><h1>Mục lục</h1><ol>${navItems.join('')}</ol></nav>`)) });
    entries.push({ name: 'OEBPS/toc.ncx', data: utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${xmlEsc(book.title)}</text></docTitle><navMap>${ncxPoints.join('')}</navMap></ncx>`) });
    entries.push({ name: 'OEBPS/content.opf', data: utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2005/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${xmlEsc(book.title)}</dc:title><dc:language>zh</dc:language>${book.bookKey ? `<dc:source>${xmlEsc(book.bookKey)}</dc:source>` : ''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`) });
    return zipStore(entries);
  }

  const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
  const resolvePath = (base, href) => {
    const parts = (dirname(base) + decodeURIComponent(href.split('#')[0])).split('/');
    const out = [];
    parts.forEach((s) => { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); });
    return out.join('/');
  };

  /** Đọc EPUB (của extension hoặc EPUB bất kỳ) → {title, cover, chapters:[{url,title,blocks,paragraphs}]} theo thứ tự spine. Nội dung đi qua cleanText.
   *  @param {Uint8Array} bytes */
  async function parseEpub(bytes) {
    const zip = zipRead(bytes);
    const text = async (name) => {
      const f = zip.get(name);
      if (!f) throw new Error(`EPUB thiếu ${name}.`);
      return new TextDecoder('utf-8').decode(await f());
    };
    const xml = (s, type) => new DOMParser().parseFromString(s, type || 'application/xml');
    const container = xml(await text('META-INF/container.xml'));
    const rf = container.querySelector('rootfile');
    const opfPath = rf && rf.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB thiếu container/rootfile.');
    const opf = xml(await text(opfPath));
    const items = new Map();
    opf.querySelectorAll('manifest > item').forEach((it) => {
      items.set(it.getAttribute('id'), { href: it.getAttribute('href') || '', type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
    });
    const dcTitle = opf.getElementsByTagName('dc:title')[0] || opf.querySelector('title');
    const title = ((dcTitle && dcTitle.textContent) || '').trim();

    let cover = null;
    const metaCover = opf.querySelector('metadata > meta[name="cover"]');
    let coverItem = [...items.values()].find((i) => /cover-image/.test(i.props));
    if (!coverItem && metaCover) coverItem = items.get(metaCover.getAttribute('content'));
    if (coverItem && /^image\//.test(coverItem.type)) {
      const f = zip.get(resolvePath(opfPath, coverItem.href));
      if (f) cover = { mime: coverItem.type, data: await f() };
    }

    const chapters = [];
    const refs = [...opf.querySelectorAll('spine > itemref')];
    for (let i = 0; i < refs.length; i += 1) {
      const id = refs[i].getAttribute('idref');
      const it = items.get(id);
      if (!it || !/x?html/.test(it.type) || /\bnav\b/.test(it.props)) continue;
      if (id === 'cover' || (coverItem && it.href === 'cover.xhtml')) continue;
      const src = await text(resolvePath(opfPath, it.href));
      let doc = xml(src, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) doc = xml(src, 'text/html');
      const body = doc.querySelector('body');
      if (!body) continue;
      const head = body.querySelector('h1,h2,h3');
      const docTitle = doc.querySelector('title');
      const chTitle = stripLinks(((head && head.textContent) || (docTitle && docTitle.textContent) || '').replace(/\s+/g, ' ').trim()).trim();
      const blocks = blocksOf(body).filter((b) => b.text && b.text !== chTitle && b.text !== squeezeSpaces(chTitle));
      if (!blocks.length) continue;
      chapters.push({ url: body.getAttribute('data-hn-url') || '', title: chTitle || `Chương ${chapters.length + 1}`, blocks, paragraphs: blocks.map((b) => b.text) });
    }
    return { title, cover, chapters };
  }

  root.HNCore = {
    han, stripLinks, extractPage, findTocUrl, parseToc, looksLikeToc, guessBookTitle, safeName, buildEpub, parseEpub, zipRead, cleanText, squeezeSpaces, isChallengeHtml, stripHash,
  };
}(typeof globalThis !== 'undefined' ? globalThis : window));
