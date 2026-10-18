/**
 * Bookmarklet “Tải qua trình duyệt” cho các trang bị Cloudflare chặn bot.
 *
 * RÀNG BUỘC: `captureMain` được serialize bằng `Function.prototype.toString()` rồi chạy trên trang đích,
 * nên nó phải TỰ CHỨA — không import, không tham chiếu biến/hàm nằm ngoài thân hàm.
 *
 * Nó chỉ đọc DOM mà trình duyệt của người dùng đã render (sau khi người dùng tự qua challenge). Nếu gặp
 * trang challenge hoặc không có nội dung thì DỪNG và báo người dùng; không cố vượt qua.
 */
export type CapturedTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
/** Khối nội dung giữ nguyên loại thẻ: tiêu đề (h1–h6) hoặc đoạn văn (p; mỗi div/dòng văn bản → một p). */
export interface CapturedBlock { tag: CapturedTag; text: string }
/** `paragraphs` = văn bản của mọi khối (tương thích gói cũ); `blocks` giữ thêm loại thẻ. */
export interface CapturedChapter { url: string; title: string; paragraphs: string[]; blocks?: CapturedBlock[] }

export interface CaptureBundle {
  format: 'hoangu-capture/1';
  bookTitle: string;
  sourceOrigin: string;
  bookKey: string;
  capturedAt: string;
  chapters: CapturedChapter[];
  nextUrl?: string;
}

export interface CapturedPage { title: string; paragraphs: string[]; blocks?: CapturedBlock[]; next?: string; challenge?: boolean }

export interface CaptureEnv {
  sleep?: (ms: number) => Promise<void>;
  loadPage?: (url: string) => Promise<CapturedPage | null>;
  save?: (fileName: string, json: string) => void;
  maxChapters?: number;
}

export function captureMain(env?: CaptureEnv): void {
  const w = window;
  const doc = document;
  if (doc.getElementById('hoangu-capture')) return;

  const e: CaptureEnv = env || {};
  const MAX = e.maxChapters || 200;
  const NEXT_RE = /下一章|下一页|下章|下一节/;
  const TOC_RE = /目录|目錄|章节列表|章節列表/;
  const CHALLENGE_RE = /Just a moment|cf-chl|challenge-form|challenges\.cloudflare\.com/i;
  const SELECTORS = ['#content', '#chaptercontent', '.Readarea', '.chapter-content', 'article'];
  const han = (s: string) => (s.match(/[一-鿿]/g) || []).length;
  const sleep = e.sleep || ((ms: number) => new Promise<void>((r) => { w.setTimeout(r, ms); }));

  const SKIP_RE = /^(script|style|iframe|noscript)$/i;
  const BLOCK_RE = /^(p|div|li|section|article|ul|ol|blockquote|tr)$/i;
  const HEAD_RE = /^h[1-6]$/i;

  /** Duyệt DOM theo thứ tự: h1–h6 → khối tiêu đề; chữ trong div/p/dòng → khối p. */
  function blocksOf(root: Element): CapturedBlock[] {
    const out: CapturedBlock[] = [];
    let buf = '';
    const flush = () => {
      buf.split('\n').forEach((l) => {
        const t = l.replace(/\s+/g, ' ').trim();
        if (t) out.push({ tag: 'p', text: t });
      });
      buf = '';
    };
    const walk = (n: Node) => {
      if (n.nodeType === 3) { buf += n.nodeValue || ''; return; }
      if (n.nodeType !== 1) return;
      const el = n as Element;
      const name = el.tagName;
      if (SKIP_RE.test(name) || (el.matches && el.matches('.ads,.bottem'))) return;
      if (name === 'BR') { buf += '\n'; return; }
      if (HEAD_RE.test(name)) {
        flush();
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) out.push({ tag: name.toLowerCase() as CapturedTag, text: t });
        return;
      }
      const isBlock = BLOCK_RE.test(name);
      if (isBlock) flush();
      el.childNodes.forEach(walk);
      if (isBlock) flush();
    };
    root.childNodes.forEach(walk);
    flush();
    return out;
  }

  function pickContent(d: Document): Element | null {
    for (const sel of SELECTORS) {
      const el = d.querySelector(sel);
      if (el && han(el.textContent || '') > 0) return el;
    }
    let cur: Element | null = null;
    let best = 0;
    d.querySelectorAll('div,section').forEach((el) => {
      const s = han(el.textContent || '');
      if (s > best) { best = s; cur = el; }
    });
    let node = cur as Element | null;
    while (node) {
      const here = han(node.textContent || '');
      let deeper: Element | null = null;
      node.querySelectorAll(':scope > div,:scope > section').forEach((c) => {
        if (han(c.textContent || '') >= here * 0.8) deeper = c;
      });
      if (!deeper) break;
      node = deeper;
    }
    return node;
  }

  function isTocUrl(next: URL, page: URL): boolean {
    return next.href === page.href || next.pathname.endsWith('/') || /index\.html?$/i.test(next.pathname);
  }

  function findAnchor(d: Document, re: RegExp, withRel: boolean): HTMLAnchorElement | null {
    const links = d.querySelectorAll('a[href]');
    for (let i = 0; i < links.length; i += 1) {
      const a = links[i] as HTMLAnchorElement;
      if (re.test(a.textContent || '') || (withRel && (a.getAttribute('rel') || '').toLowerCase() === 'next')) return a;
    }
    return null;
  }

  function extract(d: Document, pageUrl: string): CapturedPage {
    const full = d.documentElement ? d.documentElement.outerHTML : '';
    const el = pickContent(d);
    const all = el ? blocksOf(el) : [];
    if (!all.length && CHALLENGE_RE.test(full.slice(0, 20000))) return { title: '', paragraphs: [], challenge: true };
    // Tiêu đề chương: thẻ h1–h3 đầu tiên nằm trong khối nội dung (vd. h2 của hetushu.com), rồi mới tới h1/h2 của trang.
    const inner = all.filter((b) => b.tag !== 'p' && b.tag < 'h4')[0];
    const h = d.querySelector('h1') || d.querySelector('h2');
    const title = ((inner && inner.text) || (h && h.textContent) || d.title || '').trim();
    const blocks = all.filter((b) => b.text !== title);
    const body = blocks.map((b) => b.text);
    let next: string | undefined;
    const a = (d.querySelector('a#next') || d.querySelector('#next a') || findAnchor(d, NEXT_RE, true)) as HTMLAnchorElement | null;
    if (a) {
      try {
        const page = new URL(pageUrl);
        const n = new URL(a.getAttribute('href') || '', page);
        if (n.origin === page.origin && !isTocUrl(n, page)) next = n.href;
      } catch { /* link hỏng */ }
    }
    return { title, paragraphs: body, blocks, next };
  }

  async function loadViaFetch(url: string): Promise<CapturedPage | null> {
    const res = await w.fetch(url, { credentials: 'include' });
    const html = await res.text();
    const d = new DOMParser().parseFromString(html, 'text/html');
    const page = extract(d, url);
    if (!page.paragraphs.length && (res.status === 403 || res.status === 503 || CHALLENGE_RE.test(html.slice(0, 20000)))) {
      return { title: '', paragraphs: [], challenge: true };
    }
    return page;
  }

  function loadViaFrame(url: string): Promise<CapturedPage | null> {
    return new Promise((resolve) => {
      const f = doc.createElement('iframe');
      f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
      let done = false;
      const finish = (v: CapturedPage | null) => { if (done) return; done = true; f.remove(); resolve(v); };
      w.setTimeout(() => finish(null), 45000);
      f.onload = () => {
        const started = Date.now();
        const poll = () => {
          if (done) return;
          let d: Document | null = null;
          try { d = f.contentDocument; } catch { d = null; }
          if (!d) { loadViaFetch(url).then(finish, () => finish(null)); return; }
          const page = extract(d, url);
          if (page.challenge) { finish(page); return; }
          if (han(page.paragraphs.join('')) > 20) { w.setTimeout(() => finish(extract(d as Document, url)), 800); return; }
          if (Date.now() - started > 15000) { finish(page); return; }
          w.setTimeout(poll, 500);
        };
        poll();
      };
      f.src = url;
      doc.body.appendChild(f);
    });
  }

  const loadPage = e.loadPage || loadViaFrame;

  // ---- panel ----
  const panel = doc.createElement('div');
  panel.id = 'hoangu-capture';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fffaf0;color:#222;border:2px solid #b91c1c;border-radius:8px;padding:10px 12px;font:14px/1.4 sans-serif;max-width:320px;box-shadow:0 2px 12px rgba(0,0,0,.3)';
  const status = doc.createElement('div');
  const stopBtn = doc.createElement('button');
  const saveBtn = doc.createElement('button');
  stopBtn.textContent = 'Dừng';
  saveBtn.textContent = 'Tải file';
  stopBtn.style.cssText = saveBtn.style.cssText = 'margin:6px 6px 0 0;padding:2px 10px;cursor:pointer';
  panel.append(status, stopBtn, saveBtn);
  doc.body.appendChild(panel);

  const chapters: CapturedChapter[] = [];
  const seen: Record<string, boolean> = {};
  let stopped = false;
  let nextUrl: string | undefined;
  const say = (m: string) => { status.textContent = m; };
  stopBtn.onclick = () => { stopped = true; say(`Đang dừng… (${chapters.length} chương)`); };

  function bookTitle(): string {
    const first = chapters[0] ? chapters[0].title : '';
    const parts = doc.title.split(/[-_|—·]/).map((s) => s.trim()).filter(Boolean);
    const pick = parts.filter((p) => p !== first && !/第.{1,9}[章节節回]/.test(p))[0];
    return pick || parts[0] || first || 'Truyện';
  }

  function bookKey(): string {
    const toc = findAnchor(doc, TOC_RE, false);
    try {
      if (toc) return new URL(toc.getAttribute('href') || '', w.location.href).href.split('#')[0];
    } catch { /* bỏ qua */ }
    return chapters[0] ? chapters[0].url : w.location.href;
  }

  function buildJson(): string {
    const bundle: CaptureBundle = {
      format: 'hoangu-capture/1', bookTitle: bookTitle(), sourceOrigin: w.location.origin, bookKey: bookKey(),
      capturedAt: new Date().toISOString(), chapters, nextUrl,
    };
    return JSON.stringify(bundle);
  }

  function save(): void {
    if (!chapters.length) { say('Chưa có chương nào để tải.'); return; }
    const json = buildJson();
    const fileName = `${bookTitle().replace(/[\\/:*?"<>|]/g, '_')}.hoangu.json`;
    if (e.save) { e.save(fileName, json); return; }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = doc.createElement('a');
      a.href = url; a.download = fileName;
      doc.body.appendChild(a); a.click(); a.remove();
      w.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      if (w.navigator.clipboard) w.navigator.clipboard.writeText(json).then(() => say('Trình duyệt chặn tải file — đã sao chép JSON vào clipboard.'), () => say('Không tải/sao chép được.'));
    }
  }
  saveBtn.onclick = save;

  async function run(): Promise<void> {
    let page: CapturedPage = extract(doc, w.location.href);
    if (!page.paragraphs.length) { say('Không thấy nội dung chương ở trang này. Hãy mở một trang chương rồi bấm lại.'); return; }
    let url = w.location.href;
    let reason = '';
    while (true) {
      seen[url] = true;
      chapters.push({ url, title: page.title || `Chương ${chapters.length + 1}`, paragraphs: page.paragraphs, blocks: page.blocks });
      nextUrl = page.next;
      say(`Đã lấy ${chapters.length} chương…`);
      if (!page.next) { reason = 'Hết truyện (không còn link “下一章”).'; break; }
      if (stopped) { reason = 'Đã dừng.'; break; }
      if (chapters.length >= MAX) { reason = `Đủ ${MAX} chương cho lượt này — mở chương kế và bấm lại để tải tiếp.`; break; }
      if (seen[page.next]) { reason = 'Phát hiện vòng lặp link — dừng.'; break; }
      await sleep(2000 + Math.floor(Math.random() * 2000));
      if (stopped) { reason = 'Đã dừng.'; break; }
      const target: string = page.next;
      let p: CapturedPage | null = null;
      try { p = await loadPage(target); } catch { p = null; }
      if (!p || p.challenge || !p.paragraphs.length) {
        reason = p && p.challenge
          ? 'Gặp trang kiểm tra bot — hãy tải lại trang, qua kiểm tra rồi bấm bookmarklet tiếp từ chương này.'
          : 'Không đọc được chương kế — hãy tải lại trang rồi bấm tiếp.';
        break;
      }
      url = target;
      page = p;
    }
    say(`${reason} (${chapters.length} chương) — bấm “Tải file”.`);
  }

  void run();
}

export function buildBookmarkletSource(): string {
  return `(${captureMain.toString()})()`;
}

export function buildBookmarkletHref(): string {
  return `javascript:${encodeURIComponent(buildBookmarkletSource())}`;
}
