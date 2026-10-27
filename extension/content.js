/* Panel “HoaNgữ – Tải truyện”: duyệt mục lục, tải tuần tự từng chương bằng chính trình duyệt của bạn
 * (đã qua kiểm tra bot như người đọc bình thường), xuất EPUB (có ảnh bìa) và nhớ chương đã lưu theo URL.
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
    book: (b) => `hn:book:${b}`, chap: (b) => `hn:chap:${b}`, body: (b, n) => `hn:body:${b}#${n}`, bodyUrl: (b, u) => `hn:body:${b}@${u}`, buf: (b) => `hn:buf:${b}`, ui: 'hn:ui', cover: (b) => `hn:cover:${b}`, toc: (b) => `hn:toc:${b}`, idx: 'hn:idx', reg: 'hn:books',
  };

  // ---------- trạng thái ----------
  const here = C.stripHash(location.href);
  const s = {
    bookKey: '', tocUrl: null, info: null, chap: {}, toc: [], livePage: null, isTocPage: false,
    running: false, stop: false, from: 1, count: '', offset: 0, filter: '', msg: '',
    sel: new Set(), lastClick: -1, cover: null, editing: null, tab: 'dl',
  };
  /** Key chứa nội dung một chương: bản mới lưu theo URL (không thể đè nhau); bản cũ theo số thứ tự n. */
  const bodyKey = (c, url) => c.k || (c.n != null ? K.body(s.bookKey, c.n) : K.bodyUrl(s.bookKey, url));

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
    input.wide,input.edit{width:100%;box-sizing:border-box}
    .ttl{cursor:text;border-bottom:1px dashed #bbb}
    .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .msg{padding:4px 6px;background:#fff;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap}
    .warn{border-color:#b91c1c;color:#b91c1c}
    .list{border:1px solid #ddd;background:#fff;max-height:220px;overflow:auto}
    .it{display:flex;gap:6px;padding:2px 6px;cursor:pointer;border-bottom:1px solid #f0f0f0}
    .it:hover{background:#fdecec}.it.sel{background:#fbd5d5}
    .it i{width:14px;font-style:normal;color:#15803d}.it span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .n{color:#888;min-width:34px}
    small{color:#666}
    .tabs{display:flex;border-bottom:2px solid #b91c1c;background:#fde8e8}
    .tabs button{flex:1;border:0;border-radius:0;background:transparent;padding:6px 4px;font-weight:600}
    .tabs button.on{background:#b91c1c;color:#fff}
    .sw{display:flex;align-items:center;gap:8px;padding:0;border:0;background:none;color:inherit;font-weight:600}
    .sw i{position:relative;width:38px;height:20px;border-radius:99px;background:#bbb;transition:background .15s;flex:none}
    .sw i::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
    .sw[aria-checked="true"] i{background:#15803d}.sw[aria-checked="true"] i::after{left:20px}
    .sv{display:flex;gap:6px;align-items:baseline;padding:2px 6px;border-bottom:1px solid #f0f0f0}
    .sv b{font-size:15px}.sv span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sv button{padding:0 6px}
  </style><div class="box"><div class="hd"><b>HoaNgữ</b><button data-a="hide">×</button></div><div class="tabs"><button data-t="read">Đọc truyện</button><button data-t="dl">Tải truyện</button></div><div class="bd"></div></div>`;
  document.documentElement.appendChild(host);
  const bd = sh.querySelector('.bd');
  sh.querySelector('[data-a="hide"]').onclick = () => { host.style.display = 'none'; };
  sh.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => { s.tab = b.getAttribute('data-t'); store.set(K.ui, { tab: s.tab, reader: HN().state.on }); render(); };
  });
  const HN = () => window.HNReader;

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach((c) => e.append(c));
    return e;
  }

  function render() {
    sh.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === s.tab));
    if (s.tab === 'read') renderRead(); else renderDownload();
  }

  // ---------- tab “Đọc truyện” ----------
  function renderRead() {
    const R = HN();
    const st = R.state;
    const dict = { idle: '', loading: 'Đang tải từ điển CC-CEDICT…', ready: `Từ điển sẵn sàng (+${st.count.toLocaleString('vi-VN')} mục CC-CEDICT, cùng từ điển lõi & giáo trình của app).`, error: '⚠ Không nạp được CC-CEDICT — chỉ dùng từ điển lõi & giáo trình.' }[st.dict];
    const saved = R.getSaved();
    bd.replaceChildren(
      el('button', { class: 'sw', role: 'switch', 'aria-checked': String(st.on), onclick: () => setReader(!st.on) }, el('i'), st.on ? 'Đọc từ: BẬT' : 'Đọc từ: TẮT'),
      el('small', null, 'Bật lên rồi bấm vào chữ Hán bất kỳ trên trang web để xem phiên âm, Hán-Việt, nghĩa, chữ thành phần, nghe phát âm và lưu từ — giống tính năng tra từ của app. Link và nút trên trang vẫn bấm bình thường; Esc để đóng popup.'),
      dict ? el('div', { class: `msg${dict.startsWith('⚠') ? ' warn' : ''}` }, dict) : '',
      el('small', null, 'Công tắc chỉ có hiệu lực trên tab này; sang trang khác (bấm 下一章…) cần bấm lại biểu tượng extension để mở panel — trạng thái bật/tắt được nhớ.'),
      el('b', null, `Từ đã lưu (${saved.length})`),
      saved.length ? el('div', { class: 'list' }, saved.map((w) => el('div', { class: 'sv', title: w.meanings.join('; ') },
        el('b', { lang: 'zh-CN' }, w.simplified), el('small', null, w.pinyin), el('span', null, w.meanings[0] || ''),
        el('button', { onclick: () => R.removeSaved(w.simplified), title: 'Bỏ lưu' }, '×')))) : el('small', null, 'Chưa lưu từ nào — bấm “☆ Lưu từ” trong popup.'),
    );
  }

  async function setReader(on) {
    const R = HN();
    if (on) await R.enable(); else R.disable();
    await store.set(K.ui, { tab: s.tab, reader: on });
    render();
  }

  function renderDownload() {
    const savedCount = Object.keys(s.chap).length;
    const items = s.toc.map((c, i) => ({ ...c, n: i + 1 }));
    const f = s.filter.trim().toLowerCase();
    const view = f ? items.filter((c) => c.title.toLowerCase().includes(f)) : items;
    const off = Math.min(s.offset, Math.max(0, view.length - 1));
    const page = view.slice(off, off + LIST_PAGE);
    const selUrls = [...s.sel];
    const selSaved = selUrls.filter((u) => s.chap[u]).length;

    const oldList = bd.querySelector('.list');
    const listTop = oldList ? oldList.scrollTop : 0;
    const bdTop = bd.scrollTop;
    bd.replaceChildren(
      el('div', null, s.editing === BOOK_EDIT ? editBox(s.info.title, (v) => saveBookTitle(v))
        : el('b', { class: 'ttl', title: 'Bấm để sửa tên truyện', onclick: () => startEdit(BOOK_EDIT) }, s.info ? s.info.title : '…'), el('br'),
        el('small', null, `${savedCount} chương đã lưu trong extension · ${s.toc.length || '?'} chương trong mục lục`)),
      el('div', { class: 'row' },
        el('button', { onclick: () => loadToc(true), disabled: s.running }, s.toc.length ? 'Làm mới mục lục' : 'Tải mục lục'),
        el('button', { class: 'pri', onclick: () => exportBook(), disabled: s.running || !savedCount }, `Tải xuống EPUB (${savedCount} chương)`),
        el('button', { onclick: () => recover(), disabled: s.running, title: 'Quét kho extension, nhặt lại chương còn nội dung nhưng bị mất khỏi danh sách' }, 'Khôi phục chương mất'),
        el('button', { onclick: () => refilter(), disabled: s.running || !savedCount, title: 'Bỏ khoảng trắng (trừ sau dấu ;) rồi dọn link, “hetushu”, “.com” khỏi nội dung các chương đã lưu' }, 'Lọc lại nội dung đã lưu')),
      el('div', { class: 'row' },
        s.cover ? el('img', { src: s.cover.url, style: 'height:56px;border:1px solid #ccc;border-radius:3px', alt: 'Bìa' }) : el('small', null, 'Chưa có ảnh bìa'),
        el('button', { onclick: () => pickFile('image/*', setCover), disabled: s.running }, s.cover ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'),
        s.cover ? el('button', { onclick: () => clearCover(), disabled: s.running }, 'Gỡ bìa') : '',
        el('button', { onclick: () => pickFile('.epub,application/epub+zip', importEpub), disabled: s.running, title: 'Đổ chương trong EPUB vào kho + mục lục để tải lại / xử lý lại' }, 'Nhập EPUB')),
      s.toc.length ? el('input', { class: 'wide', placeholder: 'Lọc theo tiêu đề…', value: s.filter, oninput: (e) => { s.filter = e.target.value; s.offset = 0; render(); sh.querySelector('input.wide').focus(); } }) : '',
      s.toc.length ? el('div', { class: 'list' }, page.map((c) => el('div', {
        class: `it${s.sel.has(c.url) ? ' sel' : ''}`, title: c.title,
        onclick: (e) => toggleSel(c, view, e.shiftKey),
      }, el('input', { type: 'checkbox', checked: s.sel.has(c.url), style: 'width:auto;pointer-events:none' }), el('i', null, s.chap[c.url] ? '✓' : ''), el('span', { class: 'n' }, String(c.n)),
        s.editing === c.url ? editBox(c.title, (v) => saveChapterTitle(c.url, v))
          : el('span', { class: 'ttl', title: 'Bấm để sửa tiêu đề (bấm chỗ khác trên dòng để chọn chương)', onclick: (e) => { e.stopPropagation(); startEdit(c.url); } }, c.title)))) : '',
      s.toc.length > LIST_PAGE || f ? el('div', { class: 'row' },
        el('button', { onclick: () => { s.offset = Math.max(0, off - LIST_PAGE); render(); }, disabled: off === 0 }, '‹'),
        el('small', null, `${view.length ? off + 1 : 0}–${Math.min(off + LIST_PAGE, view.length)} / ${view.length}`),
        el('button', { onclick: () => { s.offset = off + LIST_PAGE; render(); }, disabled: off + LIST_PAGE >= view.length }, '›')) : '',
      s.toc.length ? el('div', { class: 'row' },
        'Từ #', el('input', { type: 'number', min: 1, value: String(s.from), onchange: (e) => { s.from = Number(e.target.value) || 1; } }),
        'số chương', el('input', { type: 'number', min: 1, placeholder: 'đến hết', value: s.count, onchange: (e) => { s.count = e.target.value; } }),
        el('button', { onclick: () => selectRange() }, 'Chọn khoảng')) : '',
      s.toc.length ? el('div', { class: 'row' },
        el('button', { onclick: () => { s.toc.forEach((c) => { if (!s.chap[c.url]) s.sel.add(c.url); }); render(); } }, 'Chọn chưa tải'),
        el('button', { onclick: () => { s.toc.forEach((c) => s.sel.add(c.url)); render(); } }, 'Chọn tất cả'),
        el('button', { onclick: () => { s.sel.clear(); render(); } }, 'Bỏ chọn'),
        el('small', null, `${selUrls.length} chương được chọn (${selSaved} đã lưu)`)) : '',
      el('div', { class: 'row' },
        s.toc.length ? el('button', { class: 'pri', onclick: () => startSelected(false), disabled: s.running || selUrls.length === selSaved }, 'Tải chương chưa lưu') : '',
        s.toc.length ? el('button', { onclick: () => startSelected(true), disabled: s.running || !selUrls.length, title: 'Tải lại và ghi đè các chương đã chọn' }, 'Tải lại đã chọn') : '',
        s.toc.length ? el('button', { onclick: () => exportBook(selUrls), disabled: s.running || !selSaved }, `Xuất đã chọn (${selSaved})`) : '',
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

  // ---------- sửa tiêu đề ----------
  const BOOK_EDIT = '\u0000book';
  /** Ô nhập tại chỗ: Enter/ra ngoài = lưu, Esc = hủy. */
  function editBox(value, onSave) {
    let done = false;
    const finish = (save, v) => { if (done) return; done = true; if (save) onSave(v); else { s.editing = null; render(); } };
    return el('input', {
      class: 'edit', value, onclick: (e) => e.stopPropagation(),
      onkeydown: (e) => { if (e.key === 'Enter') finish(true, e.target.value); else if (e.key === 'Escape') finish(false); },
      onblur: (e) => finish(true, e.target.value),
    });
  }
  function startEdit(key) {
    s.editing = key;
    render();
    const inp = sh.querySelector('input.edit');
    if (inp) { inp.focus(); inp.select(); }
  }
  async function saveBookTitle(v) {
    const t = C.cleanTitle(v);
    s.editing = null;
    if (t && t !== s.info.title) { s.info.title = t; await persistMeta(); say(`Đã đổi tên truyện: ${t}`); } else render();
  }
  /** Đổi tiêu đề chương trong mục lục và trong nội dung đã lưu (nếu có) — EPUB xuất ra dùng tiêu đề mới. */
  async function saveChapterTitle(url, v) {
    const t = C.cleanTitle(v);
    s.editing = null;
    const item = s.toc.find((c) => c.url === url);
    if (!t || !item || t === item.title) { render(); return; }
    item.title = t;
    await store.set(K.toc(s.bookKey), s.toc);
    const c = s.chap[url];
    if (c) {
      const k = bodyKey(c, url);
      const b = (await chrome.storage.local.get(k))[k];
      if (b) await chrome.storage.local.set({ [k]: { ...b, title: t } });
      c.t = t;
      await persistMeta();
    }
    say(`Đã đổi tiêu đề: ${t}`);
  }

  /** Mở hộp chọn file tạm (input không gắn vào giao diện để render() không làm mất nó). */
  function pickFile(accept, handler) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) handler(f); };
    document.body.appendChild(inp);
    inp.click();
  }

  // ---------- ảnh bìa ----------
  const toB64 = (u8) => { let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(bin); };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

  async function loadCover() {
    const c = await store.get(K.cover(s.bookKey), null);
    s.cover = c ? { mime: c.mime, b64: c.b64, url: `data:${c.mime};base64,${c.b64}` } : null;
  }
  async function saveCover(mime, u8) {
    const b64 = toB64(u8);
    await store.set(K.cover(s.bookKey), { mime, b64 });
    s.cover = { mime, b64, url: `data:${mime};base64,${b64}` };
  }
  async function setCover(file) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) { say('⚠ Ảnh bìa phải là JPEG, PNG, GIF hoặc WebP.'); return; }
    if (file.size > 8 * 1024 * 1024) { say('⚠ Ảnh bìa quá lớn (>8MB).'); return; }
    await saveCover(file.type, new Uint8Array(await file.arrayBuffer()));
    say('Đã đặt ảnh bìa — sẽ dùng khi tải xuống EPUB.');
  }
  async function clearCover() { await store.remove(K.cover(s.bookKey)); s.cover = null; say('Đã gỡ ảnh bìa.'); }

  function toggleSel(c, view, shift) {
    const i = view.findIndex((x) => x.url === c.url);
    if (shift && s.lastClick >= 0 && s.lastClick < view.length) {
      const [a, b] = [Math.min(s.lastClick, i), Math.max(s.lastClick, i)];
      const on = !s.sel.has(c.url);
      for (let j = a; j <= b; j += 1) { if (on) s.sel.add(view[j].url); else s.sel.delete(view[j].url); }
    } else if (s.sel.has(c.url)) s.sel.delete(c.url); else s.sel.add(c.url);
    s.lastClick = i;
    render();
  }

  function selectRange() {
    const lo = Math.max(1, Number(s.from) || 1);
    const end = s.count === '' ? s.toc.length : Math.min(s.toc.length, lo + Number(s.count) - 1);
    s.toc.slice(lo - 1, end).forEach((c) => s.sel.add(c.url));
    render();
  }

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
    // Gộp với bản đang lưu: tab/panel khác (hoặc lượt chạy cũ) không được ghi đè mất chương của nhau.
    const stored = await store.get(K.chap(s.bookKey), {});
    s.chap = { ...stored, ...s.chap };
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
    const old = s.chap[url];
    const k = old ? bodyKey(old, url) : K.bodyUrl(s.bookKey, url); // tải lại → ghi đè đúng chỗ cũ
    await store.set(k, { url, title, paragraphs: page.paragraphs, blocks: page.blocks });
    s.chap[url] = { t: title, k, at: new Date().toISOString() };
    const idx = await store.get(K.idx, {});
    idx[url] = s.bookKey;
    await store.set(K.idx, idx);
    await persistMeta();
  }

  function download(fileName, data, mime) {
    const u = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = u; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 15000);
  }

  /** Gom các chương đã lưu (tất cả, hoặc chỉ những URL được chọn) thành MỘT file .epub theo thứ tự mục lục; chương ngoài mục lục theo thứ tự lưu. */
  async function exportBook(onlyUrls) {
    await verifyChapters();
    const only = onlyUrls && new Set(onlyUrls);
    const entries = Object.entries(s.chap).filter(([u]) => !only || only.has(u));
    if (!entries.length) return;
    const order = new Map(s.toc.map((c, i) => [C.stripHash(c.url), i]));
    entries.sort(([ua, a], [ub, b]) => {
      const oa = order.has(ua); const ob = order.has(ub);
      if (oa && ob) return order.get(ua) - order.get(ub);
      if (oa !== ob) return oa ? -1 : 1;
      return String(a.at).localeCompare(String(b.at));
    });
    say('Đang gom file…');
    const chapters = [];
    let missing = 0;
    for (let i = 0; i < entries.length; i += READ_BATCH) {
      const keys = entries.slice(i, i + READ_BATCH).map(([u, c]) => bodyKey(c, u));
      const got = await chrome.storage.local.get(keys);
      keys.forEach((k, j) => {
        const want = entries[i + j][0];
        if (got[k] && C.stripHash(got[k].url) === want) chapters.push(got[k]); else missing += 1;
      });
    }
    const suffix = only ? `-${chapters.length}ch` : '';
    const fileName = `${C.safeName(s.info.title)}${suffix}.epub`;
    const cover = s.cover ? { mime: s.cover.mime, data: fromB64(s.cover.b64) } : null;
    const bytes = C.buildEpub({ title: s.info.title, bookKey: s.bookKey, cover, chapters });
    download(fileName, bytes, 'application/epub+zip');
    say(`Đã xuất ${chapters.length} chương → ${fileName}${missing ? `\n⚠ ${missing} chương mất nội dung — bấm “Khôi phục chương mất” rồi tải lại chúng.` : '\nDữ liệu vẫn còn trong extension, có thể tải thêm chương rồi xuất lại.'}`);
  }

  // ---------- nhập EPUB ----------
  /** Đổ chương của một EPUB vào kho + mục lục. Chương đã lưu được giữ nguyên; chương chưa có thì thêm; mục lục chưa có thì lấy theo EPUB.
   *  Khớp chương theo URL gốc (EPUB do extension xuất), không có thì theo tiêu đề mục lục; còn lại thêm cuối mục lục với URL tạm. */
  async function importEpub(file) {
    s.running = true;
    try {
      say(`Đang đọc “${file.name}”…`);
      const book = await C.parseEpub(new Uint8Array(await file.arrayBuffer()));
      if (!book.chapters.length) { say('⚠ Không thấy chương nào trong EPUB này.'); s.running = false; return; }
      const tocByUrl = new Map(s.toc.map((c) => [C.stripHash(c.url), c]));
      const normTitle = (x) => C.squeezeSpaces(x);
      const tocByTitle = new Map();
      s.toc.forEach((c) => { const k = normTitle(c.title); if (!tocByTitle.has(k)) tocByTitle.set(k, c); });
      const used = new Set();
      const tag = (C.cleanText(s.bookKey).length * 7919 + book.chapters.length).toString(36);
      const items = [];
      book.chapters.forEach((ch, i) => {
        let url = ch.url ? C.stripHash(ch.url) : '';
        if (!url || !tocByUrl.has(url)) {
          const hit = !url ? tocByTitle.get(normTitle(ch.title)) : null;
          if (hit && !used.has(C.stripHash(hit.url))) url = C.stripHash(hit.url);
          else if (!url) url = `epub://${tag}/${i + 1}`;
        }
        if (used.has(url)) return;
        used.add(url);
        items.push({ url, title: ch.title, paragraphs: ch.paragraphs, blocks: ch.blocks });
      });
      let added = 0;
      let skipped = 0;
      let newToc = 0;
      for (let i = 0; i < items.length; i += 50) {
        const part = items.slice(i, i + 50);
        const out = {};
        part.forEach((it) => {
          if (s.chap[it.url]) { skipped += 1; return; }
          const k = K.bodyUrl(s.bookKey, it.url);
          out[k] = { url: it.url, title: it.title, paragraphs: it.paragraphs, blocks: it.blocks };
          s.chap[it.url] = { t: it.title, k, at: new Date().toISOString() };
          added += 1;
        });
        if (Object.keys(out).length) await chrome.storage.local.set(out);
        say(`Đang nhập EPUB… ${Math.min(i + 50, items.length)}/${items.length}`);
      }
      // Mục lục: giữ mục lục hiện có, thêm các chương EPUB chưa có (cuối danh sách).
      const toc = s.toc.slice();
      items.forEach((it) => { if (!tocByUrl.has(it.url)) { toc.push({ title: it.title, url: it.url }); newToc += 1; } });
      s.toc = toc;
      await store.set(K.toc(s.bookKey), toc);
      const idx = await store.get(K.idx, {});
      items.forEach((it) => { idx[it.url] = s.bookKey; });
      await store.set(K.idx, idx);
      if (!s.info.title || s.info.title === 'Truyện') s.info.title = book.title || s.info.title;
      if (book.cover && !s.cover) await saveCover(book.cover.mime, book.cover.data);
      await persistMeta();
      s.running = false;
      const missing = s.toc.filter((c) => !s.chap[c.url]).length;
      say(`Đã nhập EPUB: +${added} chương mới, ${skipped} chương đã có (giữ nguyên), +${newToc} mục mới trong mục lục.\n${missing ? `Còn ${missing} chương chưa có nội dung — chọn “Chọn chưa tải” rồi tải.` : 'Mục lục đã đủ chương.'}`);
    } catch (err) {
      s.running = false;
      say(`⚠ Không nhập được EPUB: ${err.message}`);
    }
  }

  /** Đối chiếu danh sách chương với nội dung thật trong kho: bỏ mục không còn nội dung (để tải lại được),
   *  nhặt lại nội dung mồ côi (của truyện này hoặc khớp mục lục) bị mất khỏi danh sách. */
  /** Đọc lại nội dung thật của từng chương “đã lưu”: thiếu / sai URL / rỗng → bỏ khỏi danh sách (mất dấu ✓). Trả về số mục bị bỏ. */
  async function verifyChapters() {
    const ents = Object.entries(s.chap);
    let dropped = 0;
    for (let i = 0; i < ents.length; i += READ_BATCH) {
      const part = ents.slice(i, i + READ_BATCH);
      const keys = part.map(([u, c]) => bodyKey(c, u));
      const got = await chrome.storage.local.get(keys);
      part.forEach(([u], j) => {
        const b = got[keys[j]];
        if (!b || C.stripHash(b.url) !== u || !b.paragraphs || !b.paragraphs.length) { delete s.chap[u]; dropped += 1; }
      });
    }
    if (dropped) await store.set(K.chap(s.bookKey), s.chap);
    return dropped;
  }

  /** Chạy lại quy trình xử lý (bỏ khoảng trắng → dọn link) trên nội dung đã lưu; ghi lại chương thay đổi, bỏ đoạn rỗng. */
  async function refilter() {
    s.running = true;
    let changed = 0;
    let removed = 0;
    try {
      say('Đang lọc lại nội dung đã lưu…');
      const ents = Object.entries(s.chap);
      for (let i = 0; i < ents.length; i += READ_BATCH) {
        const part = ents.slice(i, i + READ_BATCH);
        const keys = part.map(([u, c]) => bodyKey(c, u));
        const got = await chrome.storage.local.get(keys);
        const out = {};
        keys.forEach((k) => {
          const b = got[k];
          if (!b) return;
          let blocks = (b.blocks && b.blocks.length ? b.blocks : (b.paragraphs || []).map((text) => ({ tag: 'p', text })))
            .map((x) => ({ tag: x.tag, text: C.cleanText(x.text) })).filter((x) => x.text);
          blocks = C.dedupeBlocks(blocks);
          const title = C.cleanTitle(b.title || '') || b.title;
          const same = title === b.title && blocks.length === (b.paragraphs || []).length && blocks.every((x, j) => x.text === b.paragraphs[j]);
          if (same) return;
          removed += (b.paragraphs || []).length - blocks.length;
          changed += 1;
          out[k] = { ...b, title, paragraphs: blocks.map((x) => x.text), blocks };
        });
        if (changed) await chrome.storage.local.set(out);
      }
      // Tiêu đề trong mục lục, tên truyện và nhãn chương cũng được dọn.
      let titles = 0;
      s.toc.forEach((c) => { const n = C.cleanTitle(c.title) || c.title; if (n !== c.title) { c.title = n; titles += 1; } });
      Object.values(s.chap).forEach((c) => { if (c.t) c.t = C.cleanTitle(c.t) || c.t; });
      const bt = C.cleanTitle(s.info.title) || s.info.title;
      if (bt !== s.info.title) { s.info.title = bt; titles += 1; }
      if (titles) { await store.set(K.toc(s.bookKey), s.toc); await persistMeta(); }
      say(`Đã lọc xong: sửa ${changed} chương, bỏ ${removed} đoạn rỗng.${titles ? ` Dọn ${titles} tiêu đề.` : ''} Xuất lại EPUB để có bản sạch.`);
    } catch (err) {
      say(`⚠ Lỗi khi lọc: ${err.message}`);
    }
    s.running = false;
    render();
  }

  async function recover() {
    s.running = true;
    try {
      say('Đang quét kho extension…');
      const ls = chrome.storage.local;
      const dropped = await verifyChapters();
      const all = ls.getKeys ? await ls.getKeys() : Object.keys(await ls.get(null));
      const bodies = all.filter((k) => k.startsWith('hn:body:'));
      const mine = `hn:body:${s.bookKey}`;
      const tocUrls = new Set(s.toc.map((c) => C.stripHash(c.url)));
      let found = 0;
      for (let i = 0; i < bodies.length; i += READ_BATCH) {
        const keys = bodies.slice(i, i + READ_BATCH);
        const got = await ls.get(keys);
        keys.forEach((k) => {
          const b = got[k];
          if (!b || !b.url) return;
          const u = C.stripHash(b.url);
          if (s.chap[u]) return;
          if (k.startsWith(`${mine}#`) || k.startsWith(`${mine}@`) || tocUrls.has(u)) {
            s.chap[u] = { t: b.title, k, at: new Date().toISOString() };
            found += 1;
          }
        });
      }
      await persistMeta();
      s.running = false;
      say(`Khôi phục xong: nhặt lại ${found} chương, bỏ ${dropped} mục mất nội dung (sẽ hiện chưa ✓ để tải lại).`);
    } catch (err) {
      s.running = false;
      say(`⚠ Lỗi khi khôi phục: ${err.message}`);
    }
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
        if (!s.chap[t.url] || t.force) { await saveChapter(t.url, page); got += 1; }
        if (t.onPage) t.onPage(page);
        say(`Đã lưu ${got} chương mới… (${Object.keys(s.chap).length} tổng)`);
      }
    } catch (err) {
      reason = `⚠ Lỗi: ${err && err.message ? err.message : err}`;
    }
    s.running = false;
    say(`${reason} (+${got} chương, đã lưu trong extension)`.trim());
  }

  /** Tải các chương đang tick (theo thứ tự mục lục). force=true → tải lại và ghi đè cả chương đã lưu. */
  async function startSelected(force) {
    if (!force) { s.running = true; say('Đang kiểm tra nội dung các chương đã lưu…'); const d = await verifyChapters(); s.running = false; if (d) say(`Đã bỏ ${d} chương mất nội dung khỏi danh sách đã lưu.`); }
    const all = s.toc.filter((c) => s.sel.has(c.url) && (force || !s.chap[c.url]));
    const queue = all.filter((c) => !c.url.startsWith('epub://')); // chương nhập từ EPUB không có link web để tải lại
    if (all.length > queue.length) say(`Bỏ qua ${all.length - queue.length} chương nhập từ EPUB (không có link gốc).`);
    if (!queue.length) { say('Không có chương nào cần tải trong phần đã chọn.'); return; }
    let i = 0;
    runLoop(() => {
      if (i >= queue.length) return null;
      const c = queue[i]; i += 1;
      return { ...c, force, live: C.stripHash(c.url) === here };
    }, 'Xong các chương đã chọn.');
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
    const bodyKeys = Object.entries(s.chap).map(([u, c]) => bodyKey(c, u));
    await chrome.storage.local.remove(bodyKeys);
    await Promise.all([K.book, K.chap, K.buf, K.toc].map((k) => store.remove(k(s.bookKey))));
    await store.set(K.reg, (await loadRegistry()).filter((k) => k !== s.bookKey));
    s.chap = {}; s.toc = [];
    say('Đã xóa dữ liệu truyện.');
  }

  // ---------- khởi tạo ----------
  async function init() {
    const ui = await store.get(K.ui, {});
    if (ui.tab === 'read' || ui.tab === 'dl') s.tab = ui.tab;
    HN().onChange(() => { if (s.tab === 'read') render(); });
    if (ui.reader) HN().enable();
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
    await loadCover();
    // Di trú bộ đệm của bản cũ (chương chờ xuất) vào kho chương.
    const legacy = await store.get(K.buf(s.bookKey), []);
    for (const c of legacy) if (!s.chap[c.url]) await saveChapter(c.url, c);
    if (legacy.length) await store.remove(K.buf(s.bookKey));
    s.toc = await store.get(K.toc(s.bookKey), []);
    if (s.isTocPage && !s.toc.length) await loadToc(false);
    const here1 = s.toc.findIndex((c) => C.stripHash(c.url) === here);
    if (here1 >= 0) s.from = here1 + 1;
    else if (s.toc.length) { const u = s.toc.findIndex((c) => !s.chap[c.url]); s.from = u >= 0 ? u + 1 : 1; }
    const lost = await verifyChapters();
    if (lost) s.msg = `Đã kiểm tra: ${lost} chương mất nội dung → bỏ dấu ✓, hãy chọn lại để tải. Bấm “Khôi phục chương mất” để nhặt lại nếu còn trong kho.`;
    else if (Object.keys(s.chap).length) s.msg = `Đã có ${Object.keys(s.chap).length} chương lưu trong extension — tải thêm hoặc bấm “Tải xuống truyện”.`;
    render();
  }

  window.__hoanguPanel = { toggle() { host.style.display = host.style.display === 'none' ? '' : 'none'; } };
  init();
}());
