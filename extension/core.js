/* Logic thuần (không đụng chrome.*): trích nội dung chương, link “下一章”, mục lục, nhận diện trang kiểm tra bot, dọn nội dung, đọc/ghi EPUB.
 * Nạp như classic script → gắn vào globalThis.HNCore. Dùng cùng bộ chọn với bookmarklet của app (ADR-009). */
(function (root) {
  const NEXT_RE = /下一章|下一页|下章|下一节/;
  const TOC_RE = /目录|目錄|章节列表|章節列表/;
  const CHAPTER_TITLE_RE = /第.{1,9}[章节節回卷]|^\s*\d+\s*[.、]|^\s*chapter\s*\d+/i;
  const CHALLENGE_RE = /Just a moment|cf-chl|challenge-form|challenges\.cloudflare\.com|captcha|验证码|人机验证|verify you are human|unusual traffic/i;
  const SELECTORS = ['#content', '#chaptercontent', '.Readarea', '.chapter-content', 'article'];
  // dfn/samp/bdo/q/u: hetushu chèn tên site / link giả vào giữa đoạn bằng các thẻ inline này.
  const SKIP_RE = /^(script|style|iframe|noscript|dfn|samp|bdo|q|u)$/i;
  const BLOCK_RE = /^(p|div|li|section|article|ul|ol|blockquote|tr)$/i;
  const HEAD_RE = /^h[1-6]$/i;

  // ---------- dọn nội dung ----------
  const URL_CHARS = "A-Za-z0-9\\-._~:/?#@!$&'*+,;=%\\[\\]()•·．・";
  const URL_RE = new RegExp(`https?://[${URL_CHARS}]*`, 'gi');
  const SEMI_MARK = '\u0001';

  /** Bỏ MỌI khoảng trắng (kể cả dấu cách full-width, xuống dòng), chỉ giữ khoảng trắng ngay sau dấu chấm / phẩy / chấm phẩy
   *  (. 。 , ， ; ；) — gộp thành 1 dấu cách. */
  function squeezeSpaces(text) {
    return text.replace(/([.。,，;；])\s+/g, `$1${SEMI_MARK}`).replace(/\s+/g, '').split(SEMI_MARK).join(' ');
  }

  // Watermark thường viết bằng chữ full-width (ｈｅｔｕｓｈｕ), chữ Cyrillic giống Latin, dấu • · thay cho dấu chấm…
  // → so khớp trên bản “gập” về ASCII (cùng độ dài ký tự) rồi cắt đúng đoạn tương ứng trong văn bản gốc.
  const LOOKALIKE = { 'о': 'o', 'с': 'c', 'е': 'e', 'а': 'a', 'р': 'p', 'х': 'x', 'ѕ': 's', 'і': 'i' };
  function foldAscii(s) {
    let o = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if ((c >= 0xFF21 && c <= 0xFF3A) || (c >= 0xFF41 && c <= 0xFF5A) || (c >= 0xFF10 && c <= 0xFF19)) o += String.fromCharCode(c - 0xFEE0);
      else o += LOOKALIKE[ch] || ch;
    }
    return o;
  }
  const DOT = '(?:[.．·•・] ?)';
  // [https://][m.|www.]hetushu[.com][.com]… với dấu chấm có thể là • · và chữ có thể là full-width.
  const SITE_RE = new RegExp(`(?:https?[:：][/／]{0,2})?(?:(?:m|www)${DOT})?hetushu(?:${DOT}*(?:com|cn|net))*`, 'gi');
  // Tên site bằng chữ Hán chèn giữa chữ thường (…老老和图书实实…); không đụng 和图书馆/店/室/城/籍.
  const SITE_ZH_RE = /和[\p{P}\p{S}\s]{0,2}图[\p{P}\p{S}\s]{0,2}书(?![馆店室城籍])/gu;
  // Cụm watermark “免费在线阅读” (hoặc “费在线阅读”): chỉ bỏ cụm chữ này, giữ phần còn lại của dòng (kể cả bộ đếm).
  const PAGER_RE = /免?费在线阅读/g;

  // Ký tự “|” nhiễu chèn giữa hai chữ Hán (笑咪|咪地).
  const STRAY_BAR_RE = /(?<=[一-鿿])[|｜](?=[一-鿿])/g;

  function removeFolded(text, re) {
    const f = foldAscii(text);
    let out = '';
    let last = 0;
    for (const m of f.matchAll(re)) {
      if (!m[0]) continue;
      out += text.slice(last, m.index);
      last = m.index + m[0].length;
    }
    return out + text.slice(last);
  }

  /** Dọn link chèn: tên site (kể cả dạng full-width / dấu •), URL http(s), MỌI “hetushu”, MỌI “.com” / “. com”, “www.” — gọi SAU khi đã bỏ khoảng trắng. */
  function stripLinks(text) {
    return removeFolded(removeFolded(text, URL_RE), SITE_RE).replace(/hetushu/gi, '').replace(/\.\s*com/gi, '').replace(/www\.\s*/gi, '');
  }

  /** Quy trình xử lý nội dung truyện: bỏ khoảng trắng → dọn link/watermark → bỏ tên site chữ Hán → bỏ cụm “(免)费在线阅读”. */
  function cleanText(text) {
    return stripLinks(squeezeSpaces(text)).replace(SITE_ZH_RE, '').replace(PAGER_RE, '').replace(STRAY_BAR_RE, '');
  }

  /** Làm sạch tiêu đề (chương / sách / mục lục): dọn link-watermark, tên site chữ Hán, “(免)费在线阅读”; giữ khoảng trắng trong tiêu đề. */
  function cleanTitle(text) {
    return stripLinks(text.replace(/\s+/g, ' ')).replace(SITE_ZH_RE, '').replace(PAGER_RE, '').replace(/\s+/g, ' ').trim();
  }

  /** Bỏ đoạn văn y hệt nhau trong cùng một chương (trang nguồn chèn đoạn lặp làm nhiễu); chỉ xét đoạn p dài ≥ 12 ký tự, giữ lần xuất hiện đầu. */
  function dedupeBlocks(blocks) {
    const seen = new Set();
    return blocks.filter((b) => {
      if (b.tag !== 'p' || b.text.length < 12) return true;
      if (seen.has(b.text)) return false;
      seen.add(b.text);
      return true;
    });
  }

  const han = (s) => (s.match(/[一-鿿]/g) || []).length;

  /** Phần tử bị ẩn (display:none / visibility:hidden / hidden): trang nguồn chèn thêm thẻ p nhiễu rồi ẩn hoặc xóa đi bằng script. */
  function isHidden(n) {
    if (n.hidden || (n.style && (n.style.display === 'none' || n.style.visibility === 'hidden'))) return true;
    const view = n.ownerDocument && n.ownerDocument.defaultView;
    if (!view || !view.getComputedStyle || !n.ownerDocument.contains(n)) return false;
    const cs = view.getComputedStyle(n);
    return cs.display === 'none' || cs.visibility === 'hidden';
  }

  /** Trang có script xáo trộn thẻ p rồi mới sắp lại (hetushu: <body data-randomtype=…>; khóa sắp xếp là chuỗi base64 trong meta, hoặc tải r<id>.json
   *  khi data-doctype="json") → HTML thô (fetch/DOMParser, script không chạy) còn nguyên thứ tự xáo + đoạn thừa, KHÔNG dùng được. */
  function needsScripts(d) {
    if (d.body && d.body.hasAttribute('data-randomtype')) return true;
    return Array.from(d.querySelectorAll('meta[content]')).some((m) => /^[A-Za-z0-9+/=]{40,}$/.test(m.getAttribute('content') || ''));
  }

  /** Nguồn khóa sắp xếp của trang hetushu (đúng như section.js): body[data-randomtype]=substep → tải r<mã chương>.json|.html cùng thư mục
   *  (theo data-doctype); kiểu khác → nội dung meta thứ 5. @returns {{key?:string,url?:string}|null} */
  function scrambleKeySource(d, pageUrl) {
    const b = d.body;
    if (!b || !b.hasAttribute('data-randomtype')) return null;
    if (b.getAttribute('data-randomtype') !== 'substep') {
      const m = d.getElementsByTagName('meta')[4];
      return m ? { key: m.getAttribute('content') || '' } : null;
    }
    const id = /\/([0-9]+)\.html?(?:[?#].*)?$/.exec(pageUrl);
    if (!id) return null;
    return { url: new URL(`r${id[1]}.${b.getAttribute('data-doctype') === 'json' ? 'json' : 'html'}`, pageUrl).href };
  }

  /** Sắp lại các thẻ con của #content y như script của trang: bỏ khối .mask đầu; base64-decode khóa rồi tách bằng /[A-Z]+%/;
   *  thẻ con thứ i (sau các h2 tiêu đề) có số v: v<5 → vị trí v, ngược lại vị trí v − (số v<5 đã gặp trước đó). Trả về false nếu khóa không khớp. */
  function descramble(d, keyB64) {
    const root = d.querySelector('#content');
    if (!root) return false;
    let text;
    try { text = atob(String(keyB64).trim()); } catch (e) { return false; }
    const first = root.firstElementChild;
    if (first && first.classList.contains('mask')) first.remove();
    const kids = Array.from(root.children);
    let off = 0;
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].tagName === 'H2') off = i + 1;
      if (kids[i].tagName === 'DIV' && kids[i].className !== 'chapter') break;
    }
    const parts = text.split(/[A-Z]+%/);
    if (parts.length !== kids.length - off) return false;
    const nodes = [];
    let small = 0;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i] < 5) { nodes[parts[i]] = kids[i + off]; small += 1; } else nodes[parts[i] - small] = kids[i + off];
    }
    nodes.forEach((n) => { if (n) root.appendChild(n); });
    return true;
  }

  /** Dấu vân tay nội dung chương hiện tại — đổi nghĩa là script của trang vẫn đang sắp lại/xóa thẻ. */
  function contentSignature(d) {
    const el = pickContent(d);
    return el ? `${el.childElementCount}|${el.textContent || ''}` : '';
  }

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
      if (SKIP_RE.test(name) || (n.matches && n.matches('.ads,.bottem')) || isHidden(n)) return;
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
    const ct = d.querySelector('#ctitle .title');
    const title = cleanTitle((ct && ct.textContent) || (inner && inner.text) || (h && h.textContent) || d.title || '');
    const st = squeezeSpaces(title);
    // Bỏ các h1–h3 đầu bài lặp lại tiêu đề (hetushu tách “第一季” / “第一节 …” thành hai h2).
    let lead = true;
    const body = all.filter((b) => {
      if (b.text === title || b.text === st) return false;
      if (lead && b.tag !== 'p' && b.tag < 'h4' && st.includes(b.text)) return false;
      if (b.tag === 'p') lead = false;
      return true;
    });
    const blocks = dedupeBlocks(body);
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

  const VOL_RE = /^\s*(第.{1,9}?[卷部集篇]|卷\s*[\d一二三四五六七八九十百零]+|[上中下]部)/;
  const VOL_TITLE_RE = /^(第.{1,9}?[卷部集篇][^第]*?)\s*(第.{1,9}?[章节節回].*)$/;

  /** Tách “第一卷 七玄门风云 第一章 山边小村” thành {vol, title}; không có phần quyển thì vol rỗng. */
  function splitVolume(title, vol) {
    const t = String(title || '').trim();
    if (vol) {
      const rest = t.startsWith(vol) ? t.slice(vol.length).trim() : t;
      return { vol, title: rest || t };
    }
    const m = VOL_TITLE_RE.exec(t);
    return m ? { vol: m[1].trim(), title: m[2].trim() } : { vol: '', title: t };
  }

  /** Danh sách chương [{title,url,vol?}] từ trang mục lục, theo thứ tự xuất hiện, bỏ trùng URL. */
  function parseToc(d, tocUrl) {
    const base = new URL(tocUrl);
    const items = [];
    const seen = new Set();
    // Quyển hiện hành của từng link: tiêu đề quyển (dt, h2–h6, strong…) không chứa link, đứng trước link theo thứ tự tài liệu.
    const volOf = new Map();
    let curVol = '';
    d.querySelectorAll('a[href], dt, h2, h3, h4, h5, h6, strong, b').forEach((e) => {
      if (e.tagName === 'A') { volOf.set(e, curVol); return; }
      if (e.querySelector('a[href]')) return;
      const t = cleanTitle(e.textContent || '');
      if (t && t.length <= 40 && VOL_RE.test(t) && !/[章节節回]\s*$/.test(t.split(/\s+/)[0])) curVol = t;
    });
    const push = (a) => {
      let u;
      try { u = new URL(a.getAttribute('href') || '', base); } catch (e) { return; }
      if (u.origin !== base.origin || u.href === base.href) return;
      const href = stripHash(u.href);
      const title = cleanTitle(a.textContent || '');
      if (!title || seen.has(href)) return;
      seen.add(href);
      const vol = volOf.get(a);
      items.push(vol ? { title, url: href, vol } : { title, url: href });
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
    return cleanTitle(pick || parts[0] || chapterTitle || '') || 'Truyện';
  }

  const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'truyen';

  // ---------- ZIP tối giản (ghi: deflate hoặc store; đọc: store + deflate) ----------
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

  async function deflateRaw(data) {
    const stream = new Response(data).body.pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Ghi ZIP: nén deflate từng file; file đánh dấu `store` (mimetype — chuẩn EPUB bắt buộc không nén —, ảnh đã nén sẵn) và file nén không nhỏ đi thì để nguyên.
   *  @param {Array<{name:string,data:Uint8Array,store?:boolean}>} entries @returns {Promise<Uint8Array>} */
  async function zipPack(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
      const name = utf8(e.name);
      const crc = crc32(e.data);
      let body = e.data;
      let method = 0;
      if (!e.store && e.data.length > 64) {
        const z = await deflateRaw(e.data);
        if (z.length < e.data.length) { body = z; method = 8; }
      }
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, method, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
      local.setUint32(14, crc, true); local.setUint32(18, body.length, true); local.setUint32(22, e.data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, body);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, method, true); cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, body.length, true); cen.setUint32(24, e.data.length, true);
      cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + body.length;
    }
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

  /** Dựng EPUB 3 (nén deflate) từ các chương; trả Promise<Uint8Array>. Mỗi chương ghi lại URL gốc ở thuộc tính data-hn-url của <body> để nhập lại đúng mục lục.
   *  @param {{title:string,bookKey?:string,origin?:string,cover?:{mime:string,data:Uint8Array}|null,chapters:Array<{url:string,title:string,vol?:string,blocks?:Array,paragraphs:string[]}>}} book */
  async function buildEpub(book) {
    const cover = book.cover && IMG_EXT[book.cover.mime] ? book.cover : null;
    const css = 'body{line-height:1.7}h1,h2,h3{text-align:center}p{margin:.6em 0;text-indent:2em}';
    const xhtml = (title, body, attr) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh"><head><meta charset="utf-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body${attr || ''}>${body}</body></html>`;
    const entries = [
      { name: 'mimetype', data: utf8('application/epub+zip'), store: true },
      { name: 'META-INF/container.xml', data: utf8('<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
      { name: 'OEBPS/style.css', data: utf8(css) },
    ];
    const manifest = ['<item id="style" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'];
    const spine = [];
    if (cover) {
      const img = `cover.${IMG_EXT[cover.mime]}`;
      entries.push({ name: `OEBPS/${img}`, data: cover.data, store: true });
      entries.push({ name: 'OEBPS/cover.xhtml', data: utf8(xhtml(book.title, `<div style="text-align:center"><img src="${img}" alt="${xmlEsc(book.title)}" style="max-width:100%;max-height:100%"/></div>`)) });
      manifest.push(`<item id="cover-image" href="${img}" media-type="${cover.mime}" properties="cover-image"/>`, '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="cover" linear="no"/>');
    }
    const groups = [];
    let order = 0;
    book.chapters.forEach((c, i) => {
      const file = `ch${pad(i + 1)}.xhtml`;
      const blocks = c.blocks && c.blocks.length ? c.blocks : (c.paragraphs || []).map((text) => ({ tag: 'p', text }));
      const body = `<h1>${xmlEsc(c.title)}</h1>${blocks.map((b) => `<${b.tag}>${xmlEsc(b.text)}</${b.tag}>`).join('')}`;
      entries.push({ name: `OEBPS/${file}`, data: utf8(xhtml(c.title, body, ` data-hn-url="${xmlEsc(c.url || '')}"`)) });
      manifest.push(`<item id="c${i + 1}" href="${file}" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="c${i + 1}"/>`);
      const sp = splitVolume(c.title, c.vol);
      const last = groups[groups.length - 1];
      if (sp.vol && last && last.vol === sp.vol) last.items.push({ file, title: sp.title });
      else groups.push({ vol: sp.vol, file, items: [{ file, title: sp.title }] });
    });
    const li = (f, t) => `<li><a href="${f}">${xmlEsc(t)}</a></li>`;
    const pt = (f, t, inner) => { order += 1; return `<navPoint id="n${order}" playOrder="${order}"><navLabel><text>${xmlEsc(t)}</text></navLabel><content src="${f}"/>${inner || ''}</navPoint>`; };
    const navItems = [];
    const ncxPoints = [];
    groups.forEach((g) => {
      if (!g.vol) {
        g.items.forEach((it) => { navItems.push(li(it.file, it.title)); ncxPoints.push(pt(it.file, it.title)); });
        return;
      }
      navItems.push(`<li><a href="${g.file}">${xmlEsc(g.vol)}</a><ol>${g.items.map((it) => li(it.file, it.title)).join('')}</ol></li>`);
      const volOrder = order + 1;
      const kids = (order += 1, g.items.map((it) => pt(it.file, it.title)).join(''));
      ncxPoints.push(`<navPoint id="v${volOrder}" playOrder="${volOrder}"><navLabel><text>${xmlEsc(g.vol)}</text></navLabel><content src="${g.file}"/>${kids}</navPoint>`);
    });
    const uid = `hoangu-${crc32(utf8(book.bookKey || book.title)).toString(16)}`;
    entries.push({ name: 'OEBPS/nav.xhtml', data: utf8(xhtml(book.title, `<nav epub:type="toc"><h1>Mục lục</h1><ol>${navItems.join('')}</ol></nav>`)) });
    entries.push({ name: 'OEBPS/toc.ncx', data: utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${xmlEsc(book.title)}</text></docTitle><navMap>${ncxPoints.join('')}</navMap></ncx>`) });
    entries.push({ name: 'OEBPS/content.opf', data: utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2005/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${xmlEsc(book.title)}</dc:title><dc:language>zh</dc:language>${book.bookKey ? `<dc:source>${xmlEsc(book.bookKey)}</dc:source>` : ''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`) });
    return zipPack(entries);
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
      const chTitle = cleanTitle((head && head.textContent) || (docTitle && docTitle.textContent) || '');
      const blocks = dedupeBlocks(blocksOf(body).filter((b) => b.text && b.text !== chTitle && b.text !== squeezeSpaces(chTitle)));
      if (!blocks.length) continue;
      chapters.push({ url: body.getAttribute('data-hn-url') || '', title: chTitle || `Chương ${chapters.length + 1}`, blocks, paragraphs: blocks.map((b) => b.text) });
    }
    return { title, cover, chapters };
  }

  root.HNCore = {
    needsScripts, scrambleKeySource, descramble, contentSignature, han, stripLinks, cleanTitle, extractPage, findTocUrl, parseToc, looksLikeToc, guessBookTitle, safeName, buildEpub, splitVolume, parseEpub, zipRead, cleanText, dedupeBlocks, squeezeSpaces, isChallengeHtml, stripHash,
  };
}(typeof globalThis !== 'undefined' ? globalThis : window));
