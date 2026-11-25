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
      if (!t || t.length > 40) return;
      if (VOL_RE.test(t) && !/[章节節回]\s*$/.test(t.split(/\s+/)[0])) curVol = t;
      else if (e.tagName === 'DT' && CHAPTER_TITLE_RE.test(t)) curVol = t; // 99csw: <dt>第一章 …</dt> là nhóm, chương con là <dd><a>
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
    // Nhóm link cùng khối cha lớn nhất (tiêu đề chương không theo mẫu “第N章”).
    const groups = new Map();
    anchors.forEach((a) => {
      const g = a.parentElement && a.parentElement.parentElement;
      if (g) groups.set(g, (groups.get(g) || []).concat(a));
    });
    let best = [];
    groups.forEach((list) => { if (list.length > best.length) best = list; });
    // Mẫu 第N章 chỉ khớp lác đác vài chương (còn lại tên trơn) → nhóm link lớn mới là mục lục thật.
    const sparse = items.length >= 3 && best.length >= 8 && best.length >= items.length * 2;
    if (items.length >= 3 && !sparse) return items;
    if (best.length < 5) return items;
    items.length = 0; seen.clear();
    best.forEach(push);
    return items;
  }

  /** Mục lục dán tay → [{title,url}] cùng origin với trang. Ưu tiên HTML (giữ link khi copy vùng chọn trên trang); không có thì đọc từng dòng văn bản có URL
   *  (“tiêu đề URL”, “URL tiêu đề”, hoặc dòng tiêu đề rồi dòng URL). */
  function parsePastedToc(html, text, baseUrl) {
    const base = new URL(baseUrl);
    let items = [];
    if (html && /<a[\s>]/i.test(html)) {
      const d = new DOMParser().parseFromString(html, 'text/html');
      items = parseToc(d, baseUrl);
      if (!items.length) {
        const seen = new Set();
        d.querySelectorAll('a[href]').forEach((a) => {
          try {
            const u = new URL(a.getAttribute('href') || '', base);
            const href = stripHash(u.href);
            const title = cleanTitle(a.textContent || '');
            if (title && !seen.has(href)) { seen.add(href); items.push({ title, url: href }); }
          } catch (e) { /* link hỏng */ }
        });
      }
    }
    if (!items.length && text) {
      const seen = new Set();
      let prev = '';
      String(text).split(/\r?\n/).forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        const m = /https?:\/\/[^\s<>"']+|(?:^|\s)\/[^\s<>"']+/.exec(line);
        if (!m) { prev = cleanTitle(line); return; }
        let href;
        try { href = stripHash(new URL(m[0].trim(), base).href); } catch (e) { return; }
        const title = cleanTitle(line.replace(m[0], ' ').replace(/[|\t,;]+/g, ' ')) || prev;
        prev = '';
        if (title && !seen.has(href)) { seen.add(href); items.push({ title, url: href }); }
      });
    }
    return items.filter((c) => { try { return new URL(c.url).origin === base.origin; } catch (e) { return false; } });
  }

  /** Trang mục lục? Nhiều link tiêu đề chương, hoặc (không có khối nội dung rõ ràng) một nhóm link lớn.
   *  Không dựa vào “có chữ Hán nhiều” vì mục lục cũng toàn chữ Hán. */
  function looksLikeToc(d, pageUrl) {
    const pattern = [...d.querySelectorAll('a[href]')].filter((a) => CHAPTER_TITLE_RE.test((a.textContent || '').trim())).length;
    if (pattern >= 8) return true;
    const strict = SELECTORS.some((sel) => { const e = d.querySelector(sel); return e && han(e.textContent || '') > 100; });
    return !strict && parseToc(d, pageUrl).length >= 5;
  }


  /** Ảnh bìa + thể loại từ trang danh mục (meta og:*, khối bìa, dòng “分类/类型/题材”, link thể loại). @returns {{coverUrl:string|null,genres:string[]}} */
  function parseCatalogMeta(d, pageUrl) {
    const abs = (u) => { try { return u && !/^data:/.test(u) ? new URL(u, pageUrl).href : null; } catch (e) { return null; } };
    const metaOf = (...names) => {
      for (const n of names) {
        const m = d.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
        const v = m && (m.getAttribute('content') || '').trim();
        if (v) return v;
      }
      return '';
    };
    let coverUrl = abs(metaOf('og:image', 'twitter:image'));
    if (!coverUrl) {
      const img = d.querySelector('#fmimg img, .book-img img, .bookimg img, .book-cover img, .bookcover img, .cover img, .pic img, .book-info img, .info img, #bookimg img, .detail img');
      if (img) coverUrl = abs(img.getAttribute('data-original') || img.getAttribute('data-src') || img.getAttribute('src'));
    }
    const genres = [];
    const addGenre = (g) => {
      const t = String(g || '').replace(/[\s ]+/g, ' ').replace(/^[:：\s]+|[\s,，、;；|/]+$/g, '').trim();
      if (t && t.length <= 12 && !genres.includes(t)) genres.push(t);
    };
    const cat = metaOf('og:novel:category', 'og:novel:genre', 'category', 'genre');
    cat.split(/[,，、;；|/\s]+/).forEach(addGenre);
    if (!genres.length) {
      d.querySelectorAll('a[href*="sort"], a[href*="category"], a[href*="genre"], a[href*="fenlei"], a[href*="/class"], .tags a, .tag a, .book-tags a, .labels a').forEach((a) => {
        if (a.closest('nav, header, footer, .nav, .menu, #nav')) return;
        addGenre(a.textContent);
      });
    }
    if (!genres.length) {
      const m = /(?:分\s*类|类\s*型|类\s*别|題\s*材|题\s*材|類\s*型)\s*[:：]\s*([^\s\n<|，,;；/]{1,12})/.exec(d.body ? d.body.textContent || '' : '');
      if (m) addGenre(m[1]);
    }
    return { coverUrl, genres: genres.slice(0, 12) };
  }

  /** Tên sách: đối chiếu nhiều nguồn trên trang (meta, breadcrumb, alt bìa, h1/h2, tiêu đề tab), nguồn nào được nhiều chỗ đồng ý nhất thì thắng.
   *  Loại tên chương, tên tác giả, tên site/khẩu hiệu. `d` (tuỳ chọn) là document để đọc các nguồn ngoài tiêu đề tab. */
  function guessBookTitle(docTitle, chapterTitle, d) {
    const SUFFIX = /(最新章节|最新章節|全文阅读|全文閱讀|在线阅读|在線閱讀|免费阅读|免費閱讀|免费|免費|txt下载|TXT下载|全集|无弹窗|目录|章节列表|小说|小說)+$/;
    const PREFIX = /^(免费|免費)+/;
    const norm = (t) => String(t || '').replace(/[\s\u00a0]+/g, ' ').trim().replace(SUFFIX, '').replace(PREFIX, '').trim();
    const authors = new Set();
    const src = []; // [văn bản đã chuẩn hoá, trọng số, loại]
    const add = (t, w, kind) => { const v = norm(t); if (v) src.push([v, w, kind]); };
    const hasDoc = !!(d && d.querySelector);
    if (hasDoc) {
      const meta = (...ns) => {
        for (const n of ns) {
          const m = d.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
          const v = m && (m.getAttribute('content') || '').trim();
          if (v) return v;
        }
        return '';
      };
      const a = meta('og:novel:author', 'author');
      if (a) authors.add(a);
      d.querySelectorAll('a[href*="/author/"], a[href*="author="], a[href*="/zuozhe"]').forEach((el) => { const t = (el.textContent || '').trim(); if (t) authors.add(t); });
      const am = /作\s*者\s*[:：]\s*([^\s\n<|，,;；/]{1,20})/.exec(d.body ? d.body.textContent || '' : '');
      if (am) authors.add(am[1]);
      add(meta('og:novel:book_name', 'og:novel:name'), 4, 'meta');
      // breadcrumb: “和图书 > 小说 > 玄幻小说 > 雪鹰领主” — đoạn cuối là tên truyện (trang chương: đoạn kế cuối)
      const crumb = d.querySelector('.crumb, .crumbs, .breadcrumb, .breadcrumbs, .bread, #breadcrumb, .path, .nav-path, .location, .position, .bread-crumb, .here');
      if (crumb) {
        const segs = (crumb.textContent || '').split(/[>›»＞]|\s\/\s/).map((x) => x.trim()).filter(Boolean);
        const last = segs[segs.length - 1];
        if (last && (last === chapterTitle || /第.{1,9}[章节節回]/.test(last))) add(segs[segs.length - 2], 3, 'crumb');
        else add(last, 3, 'crumb');
      }
      // alt của ảnh bìa
      d.querySelectorAll('#fmimg img, .book-img img, .bookimg img, .book-cover img, .bookcover img, .cover img, .pic img, .book-info img, .book_info img, .info img, #bookimg img, .detail img, .book img').forEach((img) => add(img.getAttribute('alt') || img.getAttribute('title'), 3, 'alt'));
      d.querySelectorAll('h1, h2').forEach((h) => add(h.textContent, 2, 'h'));
      add(meta('og:title'), 1, 'meta');
    }
    String(docTitle || '').split(/[-_|—·,，]/).forEach((x) => add(x, 1, 'title'));
    const bad = (p) => !p || p.length > 40 || p === chapterTitle || authors.has(p) || /第.{1,9}[章节節回]/.test(p) || /(书坊|书院|书库|图书|圖書|小说网|小說網|文学网|文學網|阅读网|\.com|\.net)/.test(p) || /^(首页|首頁|目录|正文|小说|小說|在线阅读|作品|书籍|书库)$/.test(p);
    const good = src.filter(([v]) => !bad(v));
    const scored = new Map();
    good.forEach(([v, w], idx) => {
      const e = scored.get(v) || { score: 0, first: idx };
      e.score += w;
      scored.set(v, e);
    });
    // tiêu đề tab có chứa tên (vd “雪鹰领主免费小说_作者”) cũng là một phiếu
    const tt = String(docTitle || '');
    scored.forEach((e, v) => { if (tt.includes(v)) e.score += 1; });
    const best = [...scored.entries()].sort((a, b) => b[1].score - a[1].score || a[1].first - b[1].first)[0];
    if (best) return cleanTitle(best[0]) || best[0];
    const fallback = src.map(([v]) => v).filter((v) => !authors.has(v) && !/第.{1,9}[章节節回]/.test(v))[0];
    return cleanTitle(fallback || norm(chapterTitle) || '') || 'Truyện';
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
   *  @param {{title:string,bookKey?:string,origin?:string,genres?:string[],cover?:{mime:string,data:Uint8Array}|null,chapters:Array<{url:string,title:string,vol?:string,blocks?:Array,paragraphs:string[]}>}} book */
  async function buildEpub(book) {
    // Spine rỗng làm Calibre báo "Spineless"; thà báo lỗi rõ ràng còn hơn xuất file hỏng.
    if (!book.chapters || !book.chapters.length) throw new Error('Không có chương nào để xuất EPUB.');
    const cover =book.cover && IMG_EXT[book.cover.mime] ? book.cover : null;
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
    entries.push({ name: 'OEBPS/content.opf', data: utf8(`<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${xmlEsc(book.title)}</dc:title><dc:language>zh</dc:language>${(book.genres || []).map((g) => `<dc:subject>${xmlEsc(g)}</dc:subject>`).join('')}${book.bookKey ? `<dc:source>${xmlEsc(book.bookKey)}</dc:source>` : ''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`) });
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
    const genres = [...opf.getElementsByTagName('dc:subject')].map((e) => (e.textContent || '').trim()).filter(Boolean);
    return { title, cover, genres, chapters };
  }

  // ---------- tự tải lại trang khi bị chặn ----------
  /** Giới hạn tải lại cả tab (lấy phiên mới) trong một lượt tải; lỗi lặp lại quá giới hạn thì dừng hẳn. */
  const RELOAD = { perChapter: 3, perRun: 30, baseMs: 3000, maxMs: 60000, jitterMs: 2000, resumeTimeoutMs: 180000, needUserMs: 15000 };

  /** Quyết định có tải lại tab sau khi chương `url` lỗi không.
   *  job: { failUrl, failCount, reloads } — trả về bản cập nhật kèm thời gian chờ (lùi dần 3s → 6s → 12s…, tối đa 60s, cộng ngẫu nhiên). */
  function reloadDecision(job, url, rnd = Math.random) {
    const tries = job.failUrl === url ? job.failCount || 0 : 0;
    const reloads = job.reloads || 0;
    if (tries >= RELOAD.perChapter) return { reload: false, reason: 'chapter', tries };
    if (reloads >= RELOAD.perRun) return { reload: false, reason: 'run', tries };
    const delay = Math.min(RELOAD.maxMs, RELOAD.baseMs * 2 ** tries) + Math.floor(rnd() * RELOAD.jitterMs);
    return { reload: true, delay, failUrl: url, failCount: tries + 1, reloads: reloads + 1 };
  }

  /** Tài liệu đang là trang chặn/kiểm tra bot (không có nội dung chương, không phải mục lục, có dấu hiệu challenge). */
  function isBlockedDoc(d, pageUrl) {
    return !!extractPage(d, pageUrl).challenge && !looksLikeToc(d, pageUrl);
  }

  /** URL mở lại trang sau khi bị chặn: bỏ hash và mọi param `__cf_chl_*` (token thử thách của Cloudflare), giữ nguyên các param khác và thứ tự.
   *  Không parse được hoặc không phải http/https → null. */
  function reloadUrl(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    const kept = u.search.slice(1).split('&').filter((p) => p && !p.split('=')[0].startsWith('__cf_chl_'));
    u.search = kept.length ? `?${kept.join('&')}` : '';
    return u.href;
  }

  // ---------- quản lý kho (trang manage.html) ----------
  /** Tên key trong chrome.storage.local — PHẢI khớp với K trong content.js. */
  const STORE = {
    book: (b) => `hn:book:${b}`, chap: (b) => `hn:chap:${b}`, toc: (b) => `hn:toc:${b}`, buf: (b) => `hn:buf:${b}`, cover: (b) => `hn:cover:${b}`,
    body: (b, n) => `hn:body:${b}#${n}`, bodyUrl: (b, u) => `hn:body:${b}@${u}`, idx: 'hn:idx', reg: 'hn:books',
  };

  /** Key chứa nội dung một chương (giống bodyKey của content.js): c.k nếu có; bản cũ theo số thứ tự n; còn lại theo URL. */
  function chapterBodyKey(bookKey, c, url) {
    if (c && c.k) return c.k;
    return c && c.n != null ? STORE.body(bookKey, c.n) : STORE.bodyUrl(bookKey, url);
  }

  /** Chương đã lưu theo thứ tự mục lục (giống lúc xuất EPUB); chương ngoài mục lục xếp sau, theo thời điểm lưu.
   *  @returns {Array<{url:string,title:string,at:string|null,v:number,vol:string|null,pos:number|null,key:string}>} pos: số thứ tự trong mục lục (1-based). */
  function orderChapters(bookKey, chap, toc) {
    const list = (toc || []).filter((c) => c && c.url);
    const order = new Map(list.map((c, i) => [stripHash(c.url), i]));
    const volBy = new Map(list.map((c) => [stripHash(c.url), c.vol || null]));
    const rows = Object.entries(chap || {}).map(([url, c]) => {
      const u = stripHash(url);
      return {
        url, title: (c && c.t) || url, at: (c && c.at) || null, v: (c && c.v) || 0,
        vol: volBy.get(u) || null, pos: order.has(u) ? order.get(u) + 1 : null, key: chapterBodyKey(bookKey, c, url),
      };
    });
    rows.sort((a, b) => {
      if (a.pos != null && b.pos != null) return a.pos - b.pos;
      if ((a.pos != null) !== (b.pos != null)) return a.pos != null ? -1 : 1;
      return String(a.at || '').localeCompare(String(b.at || ''));
    });
    return rows;
  }

  /** Mọi key thuộc một truyện (meta + bìa + nội dung chương) — xoá hết là truyện biến mất khỏi extension. */
  function bookStorageKeys(bookKey, chap) {
    const bodies = Object.entries(chap || {}).map(([u, c]) => chapterBodyKey(bookKey, c, u));
    return [STORE.book(bookKey), STORE.chap(bookKey), STORE.toc(bookKey), STORE.buf(bookKey), STORE.cover(bookKey), ...bodies];
  }

  /** Bỏ các URL khỏi chỉ mục URL→truyện (chỉ những URL đang trỏ về đúng truyện này). Trả bản mới, không sửa bản gốc. */
  function pruneIndex(idx, bookKey, urls) {
    const out = { ...(idx || {}) };
    const drop = urls ? new Set(urls) : null;
    Object.keys(out).forEach((u) => { if (out[u] === bookKey && (!drop || drop.has(u))) delete out[u]; });
    return out;
  }

  /** Key nội dung chương (hn:body:*) không thuộc mục chương nào của bất kỳ truyện nào. books: { bookKey: chapMap }. */
  function orphanBodyKeys(allKeys, books) {
    const used = new Set();
    Object.entries(books || {}).forEach(([b, chap]) => {
      Object.entries(chap || {}).forEach(([u, c]) => used.add(chapterBodyKey(b, c, u)));
    });
    return (allKeys || []).filter((k) => k.startsWith('hn:body:') && !used.has(k));
  }

  /** 1536 → "1.5 KB". */
  function fmtBytes(n) {
    if (!(n > 0)) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const v = n / 1024 ** i;
    return `${i ? v.toFixed(v < 10 ? 1 : 0) : v} ${u[i]}`;
  }

  root.HNCore = {
    STORE, chapterBodyKey, orderChapters, bookStorageKeys, pruneIndex, orphanBodyKeys, fmtBytes,
    needsScripts, scrambleKeySource, descramble, contentSignature, han, stripLinks, cleanTitle, extractPage, findTocUrl, parseToc, parsePastedToc, looksLikeToc, guessBookTitle, parseCatalogMeta, safeName, buildEpub, splitVolume, parseEpub, zipRead, cleanText, dedupeBlocks, squeezeSpaces, isChallengeHtml, stripHash, RELOAD, reloadDecision, isBlockedDoc, reloadUrl,
  };
}(typeof globalThis !== 'undefined' ? globalThis : window));
