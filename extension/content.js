/* Panel “HoaNgữ – Tải truyện”: duyệt mục lục, tải tuần tự từng chương bằng chính trình duyệt của bạn
 * (đã qua kiểm tra bot như người đọc bình thường), lưu ra file .hoangu.json và nhớ chương đã lưu theo URL.
 * Không giải/vượt challenge: gặp trang kiểm tra bot là DỪNG. */
(function () {
  if (window.__hoanguPanel) { window.__hoanguPanel.toggle(); return; }

  const C = window.HNCore;
  const READ_BATCH = 200; // số chương đọc từ storage mỗi lượt khi gom file
  const DELAY_MIN = 2000;
  const DELAY_JITTER = 2000;
  const LIST_PAGE = 200;

  // ---------- lưu trữ (chrome.storage.local + unlimitedStorage) ----------
  const store = {
    async get(k, d) { const r = await chrome.storage.local.get(k); return r[k] === undefined ? d : r[k]; },
    set(k, v) { return chrome.storage.local.set({ [k]: v }); },
    remove(k) { return chrome.storage.local.remove(k); },
  };
  const K = {
    book: (b) => `hn:book:${b}`, chap: (b) => `hn:chap:${b}`, body: (b, n) => `hn:body:${b}#${n}`, buf: (b) => `hn:buf:${b}`, toc: (b) => `hn:toc:${b}`, idx: 'hn:idx', reg: 'hn:books',
  };

  // ---------- trạng thái ----------
  const here = C.stripHash(location.href);
  const s = {
    bookKey: '', tocUrl: null, info: null, chap: {}, toc: [], livePage: null, isTocPage: false,
    running: false, stop: false, from: 1, count: '', offset: 0, filter: '', msg: '',
  };

  // ---------- UI (shadow DOM để không đụng CSS của trang) ----------
  const host = document.createElement('div');
  host.id = 'hoangu-panel-host';
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>
    :host{all:initial}
    .box{width:340px;max-height:86vh;display:flex;flex-direction:column;background:#fffaf0;color:#222;border:2px solid #b91c1c;border-radius:8px;font:13px/1.4 sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.35)}
    .hd{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#b91c1c;color:#fff;border-radius:5px 5px 0 0}
    .hd b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bd{padding:8px 10px;overflow:auto;display:flex;flex-direction:column;gap:6px}
    button{cursor:pointer;padding:3px 9px;border:1px solid #b91c1c;background:#fff;color:#b91c1c;border-radius:4px;font:inherit}
    button.pri{background:#b91c1c;color:#fff}
    button:disabled{opacity:.45;cursor:default}
    input{font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:4px;width:64px}
    input.wide{width:100%;box-sizing:border-box}
    .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .msg{padding:4px 6px;background:#fff;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap}
    .warn{border-color:#b91c1c;color:#b91c1c}
    .list{border:1px solid #ddd;background:#fff;max-height:220px;overflow:auto}
    .it{display:flex;gap:6px;padding:2px 6px;cursor:pointer;border-bottom:1px solid #f0f0f0}
    .it:hover{background:#fdecec}.it.sel{background:#fbd5d5}
    .it i{width:14px;font-style:normal;color:#15803d}.it span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .n{color:#888;min-width:34px}
    small{color:#666}
  </style><div class="box"><div class="hd"><b>HoaNgữ – Tải truyện</b><button data-a="hide">×</button></div><div class="bd"></div></div>`;
  document.documentElement.appendChild(host);
  const bd = sh.querySelector('.bd');
  sh.querySelector('[data-a="hide"]').onclick = () => { host.style.display = 'none'; };

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach((c) => e.append(c));
    return e;
  }

  function render() {
    const savedCount = Object.keys(s.chap).length;
    const items = s.toc.map((c, i) => ({ ...c, n: i + 1 }));
    const f = s.filter.trim().toLowerCase();
    const view = f ? items.filter((c) => c.title.toLowerCase().includes(f)) : items;
    const off = Math.min(s.offset, Math.max(0, view.length - 1));
    const page = view.slice(off, off + LIST_PAGE);
    const lo = Number(s.from) || 1;
    const hi = s.count === '' ? Infinity : lo + Number(s.count) - 1;

    const oldList = bd.querySelector('.list');
    const listTop = oldList ? oldList.scrollTop : 0;
    const bdTop = bd.scrollTop;
    bd.replaceChildren(
      el('div', null, el('b', null, s.info ? s.info.title : '…'), el('br'),
        el('small', null, `${savedCount} chương đã lưu trong extension · ${s.toc.length || '?'} chương trong mục lục`)),
      el('div', { class: 'row' },
        el('button', { onclick: () => loadToc(true), disabled: s.running }, s.toc.length ? 'Làm mới mục lục' : 'Tải mục lục'),
        el('button', { class: 'pri', onclick: () => exportBook(), disabled: s.running || !savedCount }, `Tải xuống truyện (${savedCount} chương)`)),
      s.toc.length ? el('input', { class: 'wide', placeholder: 'Lọc theo tiêu đề…', value: s.filter, oninput: (e) => { s.filter = e.target.value; s.offset = 0; render(); sh.querySelector('input.wide').focus(); } }) : '',
      s.toc.length ? el('div', { class: 'list' }, page.map((c) => el('div', {
        class: `it${c.n >= lo && c.n <= hi ? ' sel' : ''}`, title: c.title,
        onclick: () => { s.from = c.n; render(); },
      }, el('i', null, s.chap[c.url] ? '✓' : ''), el('span', { class: 'n' }, String(c.n)), el('span', null, c.title)))) : '',
      s.toc.length > LIST_PAGE || f ? el('div', { class: 'row' },
        el('button', { onclick: () => { s.offset = Math.max(0, off - LIST_PAGE); render(); }, disabled: off === 0 }, '‹'),
        el('small', null, `${view.length ? off + 1 : 0}–${Math.min(off + LIST_PAGE, view.length)} / ${view.length}`),
        el('button', { onclick: () => { s.offset = off + LIST_PAGE; render(); }, disabled: off + LIST_PAGE >= view.length }, '›')) : '',
      s.toc.length ? el('div', { class: 'row' },
        'Từ #', el('input', { type: 'number', min: 1, value: String(s.from), onchange: (e) => { s.from = Number(e.target.value) || 1; render(); } }),
        'số chương', el('input', { type: 'number', min: 1, placeholder: 'đến hết', value: s.count, onchange: (e) => { s.count = e.target.value; render(); } })) : '',
      el('div', { class: 'row' },
        s.toc.length ? el('button', { class: 'pri', onclick: () => startList(), disabled: s.running }, 'Tải chương đã chọn') : '',
        el('button', { class: s.toc.length ? '' : 'pri', onclick: () => startFollow(), disabled: s.running || !s.livePage }, 'Tải từ trang này (下一章)'),
        el('button', { onclick: () => { s.stop = true; say('Đang dừng…'); }, disabled: !s.running }, 'Dừng')),
      s.livePage ? '' : el('small', null, 'Trang này không phải chương — chọn chương trong mục lục.'),
      el('div', { class: `msg${s.msg.startsWith('⚠') ? ' warn' : ''}` }, s.msg || 'Sẵn sàng. Tiến độ được lưu theo URL truyện, tải lại trang không mất.'),
      el('div', { class: 'row' },
        el('button', { onclick: () => forget(), disabled: s.running }, 'Xóa dữ liệu truyện này')),
    );
    // replaceChildren dựng lại DOM → giữ nguyên vị trí cuộn của danh sách chương (không nhảy lên đầu mỗi lần cập nhật).
    const newList = bd.querySelector('.list');
    if (newList) newList.scrollTop = listTop;
    bd.scrollTop = bdTop;
  }
  const say = (m) => { s.msg = m; render(); };

  // ---------- tải trang ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadViaFetch(url) {
    const res = await fetch(url, { credentials: 'include' });
    const html = await res.text();
    const page = C.extractPage(new DOMParser().parseFromString(html, 'text/html'), url);
    if (!page.paragraphs.length && (res.status === 403 || res.status === 429 || res.status === 503 || C.isChallengeHtml(html))) {
      return { title: '', paragraphs: [], blocks: [], challenge: true };
    }
    return page;
  }

  function loadViaFrame(url) {
    return new Promise((resolve) => {
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
      let done = false;
      const finish = (v) => { if (done) return; done = true; fr.remove(); resolve(v); };
      setTimeout(() => finish(null), 45000);
      fr.onload = () => {
        const started = Date.now();
        const poll = () => {
          if (done) return;
          let d = null;
          try { d = fr.contentDocument; } catch (e) { d = null; }
          if (!d) { loadViaFetch(url).then(finish, () => finish(null)); return; }
          const page = C.extractPage(d, url);
          if (page.challenge) { finish(page); return; }
          if (C.han(page.paragraphs.join('')) > 20) { setTimeout(() => finish(C.extractPage(d, url)), 800); return; }
          if (Date.now() - started > 15000) { finish(page); return; }
          setTimeout(poll, 500);
        };
        poll();
      };
      fr.src = url;
      document.body.appendChild(fr);
    });
  }

  async function loadPage(url) {
    try { return await loadViaFrame(url); } catch (e) { return null; }
  }

  // ---------- lưu chương / xuất file ----------
  async function persistMeta() {
    s.info.updatedAt = new Date().toISOString();
    await store.set(K.book(s.bookKey), s.info);
    await store.set(K.chap(s.bookKey), s.chap);
    const reg = await loadRegistry();
    if (!reg.includes(s.bookKey)) await store.set(K.reg, [...reg, s.bookKey]);
  }

  /** Danh sách bookKey đã lưu. Dữ liệu từ bản cũ chưa có sổ đăng ký → quét một lần theo tiền tố key. */
  async function loadRegistry() {
    const reg = await store.get(K.reg, null);
    if (reg) return reg;
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('hn:book:')).map((k) => k.slice('hn:book:'.length));
    await store.set(K.reg, keys);
    return keys;
  }

  const normKey = (u) => u.replace(/#.*$/, '').replace(/index\.html?$/i, '').replace(/\/+$/, '');

  /** Thư mục chứa trang: https://x/book/38/24781.html và https://x/book/38/index.html đều → https://x/book/38/ (null nếu là gốc site). */
  function dirOf(u) {
    try {
      const url = new URL(u);
      const dir = url.pathname.replace(/[^/]*$/, '');
      return dir.length > 1 ? `${url.origin}${dir}` : null;
    } catch (e) { return null; }
  }

  /** Nhận diện truyện đang mở theo link và tên, theo thứ tự tin cậy:
   *  1) chương này đã từng lưu; 2) link 目录 của trang; 3) cùng thư mục /book/<id>/; 4) mục lục đã lưu có chứa trang này; 5) cùng tên truyện. */
  async function resolveBookKey() {
    const reg = await loadRegistry();
    const idx = await store.get(K.idx, {});
    if (!s.isTocPage && idx[here] && reg.includes(idx[here])) return idx[here];
    const tocUrl = s.isTocPage ? here : s.tocUrl;
    if (tocUrl) {
      const hit = reg.find((k) => normKey(k) === normKey(tocUrl));
      if (hit) return hit;
    }
    const dir = dirOf(here);
    if (dir) {
      const hit = reg.find((k) => normKey(k) === normKey(dir) || normKey(dirOf(k) || '') === normKey(dir));
      if (hit) return hit;
    }
    if (!s.isTocPage) {
      for (const k of reg) {
        const toc = await store.get(K.toc(k), []);
        if (toc.some((c) => C.stripHash(c.url) === here)) return k;
      }
    }
    const name = s.pageTitle;
    if (name && name !== 'Truyện') {
      for (const k of reg) {
        const info = await store.get(K.book(k), null);
        if (info && info.origin === location.origin && info.title === name) return k;
      }
    }
    return tocUrl || (dir ? `${dir}index.html` : here);
  }

  /** Nội dung chương nằm trong storage của extension (mỗi chương một key) → tải thêm hay xuất file lúc nào cũng được. */
  async function saveChapter(url, page) {
    const title = page.title || `Chương ${Object.keys(s.chap).length + 1}`;
    s.info.seq = (s.info.seq || 0) + 1;
    const n = s.info.seq;
    await store.set(K.body(s.bookKey, n), { url, title, paragraphs: page.paragraphs, blocks: page.blocks });
    s.chap[url] = { t: title, n, at: new Date().toISOString() };
    const idx = await store.get(K.idx, {});
    idx[url] = s.bookKey;
    await store.set(K.idx, idx);
    await persistMeta();
  }

  function download(fileName, json) {
    const u = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = u; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
  }

  /** Gom mọi chương đã lưu của truyện thành MỘT file .hoangu.json (theo thứ tự mục lục; chương ngoài mục lục theo thứ tự lưu). */
  async function exportBook() {
    const entries = Object.entries(s.chap);
    if (!entries.length) return;
    const order = new Map(s.toc.map((c, i) => [C.stripHash(c.url), i]));
    entries.sort(([ua, a], [ub, b]) => (order.has(ua) ? order.get(ua) : 1e9 + a.n) - (order.has(ub) ? order.get(ub) : 1e9 + b.n));
    say('Đang gom file…');
    const chapters = [];
    for (let i = 0; i < entries.length; i += READ_BATCH) {
      const keys = entries.slice(i, i + READ_BATCH).map(([, c]) => K.body(s.bookKey, c.n));
      const got = await chrome.storage.local.get(keys);
      keys.forEach((k) => { if (got[k]) chapters.push(got[k]); });
    }
    const fileName = `${C.safeName(s.info.title)}.hoangu.json`;
    download(fileName, JSON.stringify(C.makeBundle(s.info, chapters)));
    say(`Đã xuất ${chapters.length} chương → ${fileName}\nDữ liệu vẫn còn trong extension, có thể tải thêm chương rồi xuất lại.`);
  }

  // ---------- vòng tải tuần tự ----------
  async function runLoop(nextTask, limitNote) {
    s.running = true; s.stop = false;
    let got = 0;
    let reason = '';
    let first = true;
    try {
      while (true) {
        const t = nextTask();
        if (!t) { reason = limitNote || 'Hết danh sách.'; break; }
        if (s.stop) { reason = 'Đã dừng.'; break; }
        let page = t.live && s.livePage;
        if (!page) {
          if (!first) await sleep(DELAY_MIN + Math.floor(Math.random() * DELAY_JITTER));
          if (s.stop) { reason = 'Đã dừng.'; break; }
          say(`Đang tải: ${t.title || t.url}`);
          page = await loadPage(t.url);
          first = false;
          if (!page || page.challenge || !page.paragraphs.length) {
            reason = page && page.challenge
              ? '⚠ Gặp trang kiểm tra bot — đã dừng. Hãy mở trang, qua kiểm tra như bình thường rồi bấm tải tiếp.'
              : '⚠ Không đọc được chương này (rỗng/lỗi) — đã dừng.';
            break;
          }
        }
        first = false;
        if (!s.chap[t.url]) { await saveChapter(t.url, page); got += 1; }
        if (t.onPage) t.onPage(page);
        say(`Đã lưu ${got} chương mới… (${Object.keys(s.chap).length} tổng)`);
      }
    } catch (err) {
      reason = `⚠ Lỗi: ${err && err.message ? err.message : err}`;
    }
    s.running = false;
    say(`${reason} (+${got} chương, đã lưu trong extension)`.trim());
  }

  function startList() {
    const lo = Math.max(1, Number(s.from) || 1);
    const end = s.count === '' ? s.toc.length : Math.min(s.toc.length, lo + Number(s.count) - 1);
    const queue = s.toc.slice(lo - 1, end).filter((c) => !s.chap[c.url]);
    if (!queue.length) { say('Các chương trong khoảng này đã được lưu hết.'); return; }
    let i = 0;
    runLoop(() => {
      if (i >= queue.length) return null;
      const c = queue[i]; i += 1;
      return { ...c, live: C.stripHash(c.url) === here };
    }, 'Xong khoảng đã chọn.');
  }

  function startFollow() {
    let url = here;
    let page = s.livePage;
    let started = false;
    const seen = new Set();
    runLoop(() => {
      if (started) {
        if (!page.next || seen.has(page.next)) return null;
        url = page.next;
      }
      const live = !started;
      started = true;
      seen.add(url);
      return { url, title: '', live, onPage: (p) => { page = p; } };
    }, 'Hết truyện (không còn link “下一章”).');
  }

  // ---------- mục lục ----------
  async function loadToc(force) {
    if (!force && s.toc.length) return;
    let list = [];
    try {
      if (s.isTocPage) list = C.parseToc(document, here);
      else if (s.tocUrl) {
        say('Đang tải mục lục…');
        const res = await fetch(s.tocUrl, { credentials: 'include' });
        const html = await res.text();
        if (res.status === 403 || res.status === 429 || C.isChallengeHtml(html)) { say('⚠ Trang mục lục bị kiểm tra bot — hãy mở nó, qua kiểm tra rồi bấm lại.'); return; }
        list = C.parseToc(new DOMParser().parseFromString(html, 'text/html'), s.tocUrl);
      } else { say('Không tìm thấy link mục lục (目录) ở trang này — mở trang mục lục rồi bấm lại.'); return; }
    } catch (err) { say(`⚠ Không tải được mục lục: ${err.message}`); return; }
    if (!list.length) { say('Không nhận ra danh sách chương trong mục lục này.'); return; }
    s.toc = list;
    await store.set(K.toc(s.bookKey), list);
    const firstUnsaved = list.findIndex((c) => !s.chap[c.url]);
    s.from = firstUnsaved >= 0 ? firstUnsaved + 1 : 1;
    say(`Mục lục: ${list.length} chương.`);
  }

  async function forget() {
    if (!confirm('Xóa toàn bộ chương đã lưu của truyện này khỏi extension? (File đã tải xuống không bị xóa)')) return;
    const bodyKeys = Object.values(s.chap).map((c) => K.body(s.bookKey, c.n));
    await chrome.storage.local.remove(bodyKeys);
    await Promise.all([K.book, K.chap, K.buf, K.toc].map((k) => store.remove(k(s.bookKey))));
    await store.set(K.reg, (await loadRegistry()).filter((k) => k !== s.bookKey));
    s.chap = {}; s.toc = [];
    say('Đã xóa dữ liệu truyện.');
  }

  // ---------- khởi tạo ----------
  async function init() {
    const page = C.extractPage(document, here);
    s.isTocPage = C.looksLikeToc(document, here);
    const hasContent = !s.isTocPage && C.han(page.paragraphs.join('')) > 100;
    s.livePage = hasContent ? page : null;
    s.tocUrl = hasContent ? C.findTocUrl(document, here) : null;
    if (s.tocUrl === here) { s.isTocPage = true; s.livePage = null; s.tocUrl = null; }
    s.pageTitle = C.guessBookTitle(document.title, page.title);
    s.bookKey = await resolveBookKey();
    s.info = await store.get(K.book(s.bookKey), null) || {
      title: s.pageTitle, origin: location.origin, bookKey: s.bookKey, parts: 0,
    };
    s.chap = await store.get(K.chap(s.bookKey), {});
    // Di trú bộ đệm của bản cũ (chương chờ xuất) vào kho chương.
    const legacy = await store.get(K.buf(s.bookKey), []);
    for (const c of legacy) if (!s.chap[c.url]) await saveChapter(c.url, c);
    if (legacy.length) await store.remove(K.buf(s.bookKey));
    s.toc = await store.get(K.toc(s.bookKey), []);
    if (s.isTocPage && !s.toc.length) await loadToc(false);
    const here1 = s.toc.findIndex((c) => C.stripHash(c.url) === here);
    if (here1 >= 0) s.from = here1 + 1;
    else if (s.toc.length) { const u = s.toc.findIndex((c) => !s.chap[c.url]); s.from = u >= 0 ? u + 1 : 1; }
    if (Object.keys(s.chap).length) s.msg = `Đã có ${Object.keys(s.chap).length} chương lưu trong extension — tải thêm hoặc bấm “Tải xuống truyện”.`;
    render();
  }

  window.__hoanguPanel = { toggle() { host.style.display = host.style.display === 'none' ? '' : 'none'; } };
  init();
}());
