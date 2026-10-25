/* Logic thuần (không đụng chrome.*): trích nội dung chương, link “下一章”, mục lục, nhận diện trang kiểm tra bot.
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

  const han = (s) => (s.match(/[一-鿿]/g) || []).length;

  function blocksOf(rootEl) {
    const out = [];
    let buf = '';
    const flush = () => {
      buf.split('\n').forEach((l) => {
        const t = l.replace(/\s+/g, ' ').trim();
        if (t) out.push({ tag: 'p', text: t });
      });
      buf = '';
    };
    const walk = (n) => {
      if (n.nodeType === 3) { buf += n.nodeValue || ''; return; }
      if (n.nodeType !== 1) return;
      const name = n.tagName;
      if (SKIP_RE.test(name) || (n.matches && n.matches('.ads,.bottem'))) return;
      if (name === 'BR') { buf += '\n'; return; }
      if (HEAD_RE.test(name)) {
        flush();
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
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
    const title = ((inner && inner.text) || (h && h.textContent) || d.title || '').trim();
    const blocks = all.filter((b) => b.text !== title);
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

  /** Tên sách: phần tiêu đề tab không phải tên chương. */
  function guessBookTitle(docTitle, chapterTitle) {
    const parts = docTitle.split(/[-_|—·]/).map((s) => s.trim()).filter(Boolean);
    const pick = parts.filter((p) => p !== chapterTitle && !/第.{1,9}[章节節回]/.test(p))[0];
    return pick || parts[0] || chapterTitle || 'Truyện';
  }

  const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'truyen';

  /** Gói hoangu-capture/1 — cùng định dạng app nhập (CaptureBundleImporter). */
  function makeBundle(info, chapters) {
    return {
      format: 'hoangu-capture/1', bookTitle: info.title, sourceOrigin: info.origin, bookKey: info.bookKey,
      capturedAt: new Date().toISOString(),
      chapters: chapters.map((c) => ({ url: c.url, title: c.title, paragraphs: c.paragraphs, blocks: c.blocks })),
    };
  }

  root.HNCore = {
    han, extractPage, findTocUrl, parseToc, guessBookTitle, safeName, makeBundle, isChallengeHtml, stripHash,
  };
}(typeof globalThis !== 'undefined' ? globalThis : window));
