/* Panel “HoaNgữ – Tải truyện”: duyệt mục lục, tải tuần tự từng chương bằng chính trình duyệt của bạn
 * (đã qua kiểm tra bot như người đọc bình thường), xuất EPUB (có ảnh bìa) và nhớ chương đã lưu theo URL.
 * Không giải/vượt challenge: gặp trang kiểm tra bot là DỪNG. */
(function () {
  if (window.__hoanguPanel) { window.__hoanguPanel.toggle(); return; }

  const C = window.HNCore;
  const READ_BATCH = 200; // số chương đọc từ storage mỗi lượt khi gom file
  const DELAY_MIN = 500;
  const DELAY_JITTER = 200;
  const LIST_PAGE = 200;
  // Phiên bản cách cào: 2 = đã xử lý xáo trộn/đoạn nhiễu của hetushu (chờ script, bỏ thẻ ẩn, tự giải mã). Chương lưu trước đó (không có v) có thể sai thứ tự/lẫn đoạn clone.
  const SCRAPE_V = 2;
  const isOld = (c) => !c || (c.v || 0) < SCRAPE_V;

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
    sel: new Set(), lastClick: -1, cover: null, editing: null, tab: 'dl', current: null, follow: false, rangeOpen: false,
  };
  /** Key chứa nội dung một chương: bản mới lưu theo URL (không thể đè nhau); bản cũ theo số thứ tự n. */
  const bodyKey = (c, url) => c.k || (c.n != null ? K.body(s.bookKey, c.n) : K.bodyUrl(s.bookKey, url));

  // ---------- UI (shadow DOM để không đụng CSS của trang; kiểu dáng Tailwind biên dịch sẵn ở panel.css) ----------
  const host = document.createElement('div');
  host.id = 'hoangu-panel-host';
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<div class="hn-shadow flex max-h-[88vh] w-[372px] flex-col overflow-hidden rounded-xl border-2 border-brand bg-paper text-[13px] text-neutral-800" style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <div class="flex items-center gap-2 bg-brand px-3 py-2 text-white">
      <b class="text-sm tracking-wide">HoaNgữ</b>
      <div class="ml-1 flex flex-1 rounded-md bg-black/20 p-0.5" role="tablist">
        <button data-t="dl" role="tab" class="flex-1 cursor-pointer rounded px-2 py-1 text-xs font-semibold">Tải truyện</button>
        <button data-t="read" role="tab" class="flex-1 cursor-pointer rounded px-2 py-1 text-xs font-semibold">Đọc truyện</button>
      </div>
      <button data-a="hide" aria-label="Đóng panel" title="Đóng panel" class="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-black/20"></button>
    </div>
    <div class="bd hn-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3"></div>
    <div class="ft hidden flex-col gap-2 border-t border-brand/25 bg-white px-3 py-2"></div>
  </div>`;
  document.documentElement.appendChild(host);
  // CSS: nạp panel.css (web_accessible_resources) qua stylesheet nhận nuôi → không vướng CSP của trang.
  fetch(chrome.runtime.getURL('panel.css')).then((r) => r.text()).then((css) => {
    try { const ss = new CSSStyleSheet(); ss.replaceSync(css); sh.adoptedStyleSheets = [ss]; } catch (e) { const st = document.createElement('style'); st.textContent = css; sh.prepend(st); }
  }).catch(() => { /* không có CSS vẫn dùng được, chỉ xấu */ });
  const bd = sh.querySelector('.bd');
  const ft = sh.querySelector('.ft');
  const HN = () => window.HNReader;

  // Biểu tượng (Lucide, nét 2px).
  const ICONS = {
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    lifebuoy: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    stop: '<rect width="14" height="14" x="5" y="5" rx="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  };
  const icon = (name, cls = 'size-4') => {
    const e = document.createElement('span');
    e.className = `inline-flex shrink-0 ${cls}`;
    e.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-full" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return e;
  };
  sh.querySelector('[data-a="hide"]').append(icon('x'));
  sh.querySelector('[data-a="hide"]').onclick = () => { host.style.display = 'none'; };
  sh.querySelectorAll('[data-t]').forEach((b) => {
    b.onclick = () => { s.tab = b.getAttribute('data-t'); saveUi(); render(); };
  });
  const saveUi = () => store.set(K.ui, { tab: s.tab, reader: HN().state.on, mode: HN().state.mode });

  const BTN = {
    pri: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-40',
    sec: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-brand bg-white px-2.5 py-1.5 font-medium text-brand hover:bg-brand-soft disabled:pointer-events-none disabled:opacity-40',
    ico: 'grid size-7 cursor-pointer place-items-center rounded-md text-neutral-600 hover:bg-brand-soft hover:text-brand disabled:pointer-events-none disabled:opacity-40',
    chip: 'cursor-pointer rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40',
    over: 'grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-brand disabled:pointer-events-none disabled:opacity-40',
    field: 'rounded-md border border-neutral-300 bg-white px-2 py-1 outline-none focus:border-brand',
  };

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach((c) => e.append(c));
    return e;
  }
  /** Nút chỉ có biểu tượng (có tooltip + nhãn cho trình đọc màn hình). */
  const ibtn = (name, label, onclick, opts = {}) => el('button', { class: opts.class || BTN.ico, title: label, 'aria-label': label, onclick, disabled: opts.disabled }, icon(name, opts.size));

  function render() {
    sh.querySelectorAll('[data-t]').forEach((b) => {
      const on = b.getAttribute('data-t') === s.tab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('bg-white', on); b.classList.toggle('text-brand', on);
      b.classList.toggle('text-white', !on); b.classList.toggle('hover:bg-white/15', !on);
    });
    if (s.tab === 'read') renderRead(); else renderDownload();
  }

  // ---------- tab “Đọc truyện” ----------
  function renderRead() {
    const R = HN();
    const st = R.state;
    const dict = { idle: '', loading: 'Đang tải từ điển CC-CEDICT…', ready: `Từ điển sẵn sàng (+${st.count.toLocaleString('vi-VN')} mục CC-CEDICT, cùng từ điển lõi & giáo trình của app).`, error: '⚠ Không nạp được CC-CEDICT — chỉ dùng từ điển lõi & giáo trình.' }[st.dict];
    const saved = R.getSaved();
    const seg = (mode, label, hint) => el('button', {
      class: `flex-1 cursor-pointer rounded px-2 py-1 text-xs font-medium ${st.mode === mode ? 'bg-brand text-white' : 'text-neutral-700 hover:bg-brand-soft'}`, title: hint, role: 'radio', 'aria-checked': String(st.mode === mode),
      onclick: () => { R.setMode(mode); saveUi(); render(); },
    }, label);
    ft.className = 'ft hidden'; ft.replaceChildren();
    bd.replaceChildren(
      el('button', { class: 'flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left font-semibold', role: 'switch', 'aria-checked': String(st.on), onclick: () => setReader(!st.on) },
        el('span', { class: `relative h-5 w-9 shrink-0 rounded-full transition-colors ${st.on ? 'bg-green-600' : 'bg-neutral-400'}` },
          el('span', { class: `absolute top-0.5 size-4 rounded-full bg-white transition-all ${st.on ? 'left-[18px]' : 'left-0.5'}` })),
        el('span', { class: 'flex-1' }, st.on ? 'Tra từ: BẬT' : 'Tra từ: TẮT')),
      el('div', { class: 'flex flex-col gap-1' },
        el('span', { class: 'text-xs font-semibold text-neutral-600' }, 'Cách mở popup tra từ'),
        el('div', { class: 'flex gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5', role: 'radiogroup' },
          seg('alt', 'Giữ Alt + bấm', 'Bấm bình thường vẫn dùng được mọi tính năng của trang'),
          seg('click', 'Bấm vào chữ', 'Mọi cú bấm vào chữ Hán đều mở popup (trừ link/nút)')),
        el('small', { class: 'text-xs text-neutral-500' }, st.mode === 'alt'
          ? 'Bấm bình thường không bị can thiệp — tính năng bấm của trang (menu, lật trang…) vẫn dùng được. Giữ Alt (⌥ trên Mac) rồi bấm vào chữ Hán để tra.'
          : 'Bấm vào chữ Hán bất kỳ để tra; link, nút và vùng có con trỏ bấm của trang được bỏ qua. Nếu vẫn vướng, chuyển sang “Giữ Alt + bấm” hoặc tắt Tra từ.')),
      dict ? el('div', { class: `rounded-md border px-2 py-1 text-xs ${dict.startsWith('⚠') ? 'border-brand text-brand' : 'border-neutral-200 bg-white text-neutral-600'}` }, dict) : '',
      el('div', { class: 'flex items-baseline justify-between' }, el('b', null, `Từ đã lưu (${saved.length})`), el('small', { class: 'text-xs text-neutral-500' }, 'Esc để đóng popup')),
      saved.length ? el('div', { class: 'max-h-[300px] overflow-auto rounded-md border border-neutral-200 bg-white' }, saved.map((w) => el('div', { class: 'flex items-baseline gap-2 border-b border-neutral-100 px-2 py-1', title: w.meanings.join('; ') },
        el('b', { class: 'text-[15px]', lang: 'zh-CN' }, w.simplified), el('small', { class: 'text-xs text-neutral-500' }, w.pinyin), el('span', { class: 'min-w-0 flex-1 truncate' }, w.meanings[0] || ''),
        ibtn('x', 'Bỏ lưu', () => R.removeSaved(w.simplified), { class: 'grid size-5 cursor-pointer place-items-center rounded text-neutral-500 hover:bg-brand-soft hover:text-brand', size: 'size-3.5' }))))
        : el('small', { class: 'text-xs text-neutral-500' }, 'Chưa lưu từ nào — bấm “Lưu từ” trong popup.'),
      el('small', { class: 'text-xs text-neutral-500' }, 'Công tắc chỉ có hiệu lực trên tab này; sang trang khác (bấm 下一章…) cần bấm lại biểu tượng extension để mở panel — trạng thái được nhớ.'),
    );
  }

  async function setReader(on) {
    const R = HN();
    if (on) await R.enable(); else R.disable();
    await saveUi();
    render();
  }

  function renderDownload() {
    const savedCount = Object.keys(s.chap).length;
    const total = s.toc.length;
    const items = s.toc.map((c, i) => ({ ...c, n: i + 1 }));
    const f = s.filter.trim().toLowerCase();
    const view = f ? items.filter((c) => c.title.toLowerCase().includes(f)) : items;
    const off = Math.min(s.offset, Math.max(0, view.length - 1));
    const page = view.slice(off, off + LIST_PAGE);
    const selUrls = [...s.sel];
    const selSaved = selUrls.filter((u) => s.chap[u]).length;
    const oldCount = s.toc.filter((c) => s.chap[c.url] && isOld(s.chap[c.url])).length;
    const pct = total ? Math.min(100, Math.round((Object.keys(s.chap).filter((u) => s.toc.some((c) => c.url === u)).length / total) * 100)) : 0;

    const oldList = bd.querySelector('.hn-list');
    const listTop = oldList ? oldList.scrollTop : 0;
    const bdTop = bd.scrollTop;

    // --- thẻ truyện: bìa (nút bấm nằm trên bìa) + tên + tiến độ + xuất ---
    const cover = el('div', { class: 'group relative h-[104px] w-[78px] shrink-0 overflow-hidden rounded-md border border-neutral-300 bg-brand-soft' },
      s.cover
        ? el('img', { src: s.cover.url, alt: 'Bìa', class: 'size-full object-cover' })
        : el('button', { class: 'flex size-full cursor-pointer flex-col items-center justify-center gap-1 text-xs text-brand/80 hover:bg-white/60 disabled:pointer-events-none', title: 'Tải ảnh bìa', disabled: s.running, onclick: () => pickFile('image/*', setCover) }, icon('image', 'size-6'), 'Thêm bìa'),
      s.cover ? el('div', { class: 'absolute right-1 top-1 flex flex-col gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100' },
        ibtn('image', 'Đổi ảnh bìa', () => pickFile('image/*', setCover), { class: BTN.over, disabled: s.running, size: 'size-3.5' }),
        ibtn('x', 'Xoá ảnh bìa', () => clearCover(), { class: BTN.over, disabled: s.running, size: 'size-3.5' })) : '');

    const head = el('div', { class: 'flex gap-3' }, cover,
      el('div', { class: 'flex min-w-0 flex-1 flex-col gap-1.5' },
        s.editing === BOOK_EDIT ? editBox(s.info.title, (v) => saveBookTitle(v))
          : el('div', { class: 'group flex items-start gap-1' },
            el('b', { class: 'line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug' }, s.info ? s.info.title : '…'),
            ibtn('pencil', 'Sửa tên truyện', () => startEdit(BOOK_EDIT), { class: 'grid size-6 shrink-0 cursor-pointer place-items-center rounded text-neutral-400 hover:bg-brand-soft hover:text-brand', size: 'size-3.5' })),
        el('div', { class: 'h-1.5 overflow-hidden rounded-full bg-neutral-200', title: `${pct}% mục lục đã lưu` }, el('div', { class: 'h-full rounded-full bg-green-600', style: `width:${pct}%` })),
        el('small', { class: 'text-xs text-neutral-600' }, `${savedCount} chương đã lưu · ${total || '?'} trong mục lục`),
        el('button', { class: `${BTN.pri} mt-auto`, onclick: () => exportBook(), disabled: s.running || !savedCount }, icon('download'), `Tải EPUB (${savedCount})`)));

    // --- công cụ: dãy nút biểu tượng ---
    const tools = el('div', { class: 'flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white px-1 py-0.5' },
      ibtn('refresh', total ? 'Làm mới mục lục' : 'Tải mục lục', () => loadToc(true), { disabled: s.running }),
      ibtn('upload', 'Nhập EPUB — đổ chương trong EPUB vào kho + mục lục để tải lại / xử lý lại', () => pickFile('.epub,application/epub+zip', importEpub), { disabled: s.running }),
      ibtn('lifebuoy', 'Khôi phục chương mất — quét kho extension, nhặt lại chương còn nội dung nhưng mất khỏi danh sách', () => recover(), { disabled: s.running }),
      ibtn('filter', 'Lọc lại nội dung đã lưu — bỏ khoảng trắng (trừ sau dấu ;) rồi dọn link, “hetushu”, “.com” khỏi các chương đã lưu', () => refilter(), { disabled: s.running || !savedCount }),
      el('span', { class: 'flex-1' }),
      ibtn('trash', 'Xoá dữ liệu truyện này', () => forget(), { disabled: s.running, class: 'grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-red-100 hover:text-red-700 disabled:pointer-events-none disabled:opacity-40' }));

    // --- danh sách chương ---
    let lastVol = null;
    const rows = [];
    page.forEach((c) => {
      if (!f && c.vol && c.vol !== lastVol) {
        const vol = c.vol;
        rows.push(el('div', { class: 'sticky top-0 z-10 flex cursor-pointer items-center gap-1 border-b border-brand/20 bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-dark', title: 'Bấm để chọn / bỏ chọn cả quyển', onclick: () => toggleVolume(vol) }, el('span', { class: 'truncate' }, vol)));
      }
      lastVol = c.vol || lastVol;
      const isCur = s.current === c.url;
      const saved = s.chap[c.url];
      const sel = s.sel.has(c.url);
      const status = isCur ? el('span', { class: 'flex w-3 shrink-0 justify-center', title: 'Đang tải' }, el('span', { class: 'hn-pulse size-2 rounded-full bg-amber-500' }))
        : saved ? (isOld(saved) ? el('span', { class: 'w-3 shrink-0 text-center text-amber-600', title: 'Lưu bằng bản cũ — có thể sai thứ tự/lẫn đoạn nhiễu, nên tải lại' }, '△') : icon('check', 'size-3 text-green-600'))
          : el('span', { class: 'w-3 shrink-0' });
      rows.push(el('div', {
        class: `group flex cursor-pointer items-center gap-2 border-b border-neutral-100 px-2 py-1 ${isCur ? 'bg-amber-100' : sel ? 'bg-red-100' : 'hover:bg-brand-soft'}`, title: c.title, 'data-u': c.url,
        onclick: (e) => toggleSel(c, view, e.shiftKey),
      }, el('input', { type: 'checkbox', checked: sel, class: 'pointer-events-none size-3.5 shrink-0 accent-[#b91c1c]', tabindex: '-1' }), status,
      el('span', { class: 'w-8 shrink-0 text-right text-xs tabular-nums text-neutral-400' }, String(c.n)),
      s.editing === c.url ? editBox(c.title, (v) => saveChapterTitle(c.url, v))
        : [el('span', { class: 'min-w-0 flex-1 truncate' }, c.title),
          el('button', { class: 'grid size-5 shrink-0 cursor-pointer place-items-center rounded text-neutral-400 opacity-0 hover:bg-white hover:text-brand group-hover:opacity-100', title: 'Sửa tiêu đề', 'aria-label': 'Sửa tiêu đề', onclick: (e) => { e.stopPropagation(); startEdit(c.url); } }, icon('pencil', 'size-3'))]));
    });

    const chapters = total ? el('div', { class: 'flex flex-col gap-2' },
      el('div', { class: 'relative' },
        el('span', { class: 'pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400' }, icon('search', 'size-3.5')),
        el('input', { class: `${BTN.field} wide w-full pl-7`, placeholder: 'Lọc theo tiêu đề…', value: s.filter, oninput: (e) => { s.filter = e.target.value; s.offset = 0; render(); sh.querySelector('input.wide').focus(); } })),
      el('div', { class: 'flex flex-wrap items-center gap-1.5' },
        el('button', { class: BTN.chip, onclick: () => { s.toc.forEach((c) => { if (!s.chap[c.url]) s.sel.add(c.url); }); render(); } }, 'Chưa tải'),
        el('button', { class: BTN.chip, onclick: () => { s.toc.forEach((c) => s.sel.add(c.url)); render(); } }, 'Tất cả'),
        el('button', { class: BTN.chip, onclick: () => selectOld(), title: 'Tick các chương đã lưu bằng bản cào cũ (△) rồi bấm “Tải lại”' }, `Bản cũ (${oldCount})`),
        el('button', { class: BTN.chip, onclick: () => { s.sel.clear(); render(); } }, 'Bỏ chọn'),
        el('small', { class: 'ml-auto text-xs text-neutral-500' }, `${selUrls.length} chọn · ${selSaved} đã lưu`)),
      el('details', { class: 'text-xs', open: s.rangeOpen, ontoggle: (e) => { s.rangeOpen = e.target.open; } },
        el('summary', { class: 'cursor-pointer select-none text-neutral-600 hover:text-brand' }, 'Chọn theo khoảng'),
        el('div', { class: 'mt-1.5 flex items-center gap-1.5' },
          'Từ #', el('input', { type: 'number', min: 1, class: `${BTN.field} w-16`, value: String(s.from), onchange: (e) => { s.from = Number(e.target.value) || 1; } }),
          'số chương', el('input', { type: 'number', min: 1, class: `${BTN.field} w-20`, placeholder: 'đến hết', value: s.count, onchange: (e) => { s.count = e.target.value; } }),
          el('button', { class: BTN.chip, onclick: () => selectRange() }, 'Chọn'))),
      el('div', { class: 'hn-list hn-scroll relative max-h-[230px] overflow-auto rounded-md border border-neutral-200 bg-white' }, rows),
      total > LIST_PAGE || f ? el('div', { class: 'flex items-center justify-center gap-2' },
        ibtn('left', 'Trang trước', () => { s.offset = Math.max(0, off - LIST_PAGE); render(); }, { disabled: off === 0 }),
        el('small', { class: 'text-xs text-neutral-500' }, `${view.length ? off + 1 : 0}–${Math.min(off + LIST_PAGE, view.length)} / ${view.length}`),
        ibtn('right', 'Trang sau', () => { s.offset = off + LIST_PAGE; render(); }, { disabled: off + LIST_PAGE >= view.length })) : '')
      : el('div', { class: 'rounded-md border border-dashed border-neutral-300 bg-white px-3 py-4 text-center text-xs text-neutral-500' }, 'Chưa có mục lục. Bấm ', el('b', null, '↻'), ' ở dãy công cụ để tải mục lục, hoặc dùng “Từ trang này” ở dưới.');

    bd.replaceChildren(head, tools, chapters);

    // --- thanh thao tác cố định phía dưới ---
    const warn = s.msg.startsWith('⚠');
    ft.className = 'ft flex flex-col gap-2 border-t border-brand/25 bg-white px-3 py-2';
    ft.replaceChildren(
      el('div', { class: `flex max-h-[72px] items-start gap-1.5 overflow-auto whitespace-pre-wrap rounded-md border px-2 py-1 text-xs ${warn ? 'border-brand bg-brand-soft text-brand-dark' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`, role: 'status' },
        warn ? icon('alert', 'mt-px size-3.5') : '', el('span', { class: 'min-w-0 flex-1' }, s.msg || 'Sẵn sàng. Tiến độ được lưu theo URL truyện, tải lại trang không mất.')),
      s.livePage || !total ? '' : el('small', { class: 'text-xs text-neutral-500' }, 'Trang này không phải chương — chọn chương trong mục lục.'),
      el('div', { class: 'flex flex-wrap gap-1.5' },
        total ? el('button', { class: BTN.pri, onclick: () => startSelected(false), disabled: s.running || selUrls.length === selSaved, title: 'Tải các chương đã chọn mà chưa lưu' }, icon('download'), 'Tải chưa lưu') : '',
        total ? el('button', { class: BTN.sec, onclick: () => startSelected(true), disabled: s.running || !selUrls.length, title: 'Tải lại và ghi đè các chương đã chọn' }, icon('refresh'), 'Tải lại') : '',
        total ? el('button', { class: BTN.sec, onclick: () => exportBook(selUrls), disabled: s.running || !selSaved, title: 'Xuất EPUB chỉ gồm các chương đã chọn và đã lưu' }, icon('upload'), `Xuất chọn (${selSaved})`) : '',
        el('button', { class: total ? BTN.sec : BTN.pri, onclick: () => startFollow(), disabled: s.running || !s.livePage, title: 'Tải trang này rồi lần theo link 下一章 (chương kế)' }, icon('skip'), 'Từ trang này'),
        s.running ? el('button', { class: 'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 font-semibold text-white hover:bg-black', onclick: () => { s.stop = true; say('Đang dừng…'); } }, icon('stop', 'size-3.5'), 'Dừng') : ''));

    // replaceChildren dựng lại DOM → giữ vị trí cuộn; riêng khi đang tải thì cuộn tới chương đang tải (một lần mỗi chương).
    const newList = bd.querySelector('.hn-list');
    if (newList) {
      newList.scrollTop = listTop;
      if (s.follow) {
        s.follow = false;
        const row = [...newList.querySelectorAll('[data-u]')].find((r) => r.getAttribute('data-u') === s.current);
        if (row) newList.scrollTop = Math.max(0, row.offsetTop - newList.clientHeight / 2 + row.offsetHeight / 2);
      }
    }
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
      class: `edit ${BTN.field} min-w-0 flex-1`, value, onclick: (e) => e.stopPropagation(),
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

  /** Bấm tiêu đề quyển: chọn cả quyển, hoặc bỏ chọn nếu đã chọn đủ. */
  function toggleVolume(vol) {
    const urls = s.toc.filter((c) => c.vol === vol).map((c) => c.url);
    const all = urls.every((u) => s.sel.has(u));
    urls.forEach((u) => { if (all) s.sel.delete(u); else s.sel.add(u); });
    render();
  }

  /** Tick các chương đã lưu bằng bản cào cũ (bỏ chương nhập từ EPUB vì không có link gốc để tải lại). */
  function selectOld() {
    s.sel.clear();
    s.toc.forEach((c) => { if (s.chap[c.url] && isOld(s.chap[c.url]) && !c.url.startsWith('epub://')) s.sel.add(c.url); });
    say(s.sel.size ? `Đã chọn ${s.sel.size} chương lưu bằng bản cũ — bấm “Tải lại đã chọn”.` : 'Không có chương nào lưu bằng bản cũ.');
  }

  function selectRange() {
    const lo = Math.max(1, Number(s.from) || 1);
    const end = s.count === '' ? s.toc.length : Math.min(s.toc.length, lo + Number(s.count) - 1);
    s.toc.slice(lo - 1, end).forEach((c) => s.sel.add(c.url));
    render();
  }

  // ---------- tải trang ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Đợi script của trang (xáo trộn rồi sắp lại / xóa thẻ p thừa) chạy xong, tối đa 12s.
   *  Trang hetushu (body[data-randomtype]): script xóa khối .mask rồi sắp lại ĐỒNG BỘ → thấy .mask biến mất là xong, chỉ đợi thêm 300ms cho chắc.
   *  Trang khác: tải xong + nội dung không đổi liên tục ~1,2s. */
  async function settle(d) {
    const t0 = Date.now();
    const left = () => Date.now() - t0 < 12000;
    const quiet = async (ms) => {
      let sig = C.contentSignature(d);
      let since = Date.now();
      while (Date.now() - since < ms && left()) {
        await sleep(100);
        const cur = C.contentSignature(d);
        if (cur !== sig) { sig = cur; since = Date.now(); }
      }
    };
    if (d.body && d.body.hasAttribute('data-randomtype')) {
      while (d.readyState === 'loading' && left()) await sleep(50);
      while (d.querySelector('#content > .mask') && left()) await sleep(50);
      await quiet(300);
      return;
    }
    while (d.readyState !== 'complete' && left()) await sleep(200);
    await quiet(1200);
  }

  async function loadViaFetch(url) {
    const res = await fetch(url, { credentials: 'include' });
    const html = await res.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    if (C.needsScripts(parsed)) {
      // Script của trang không chạy trong DOMParser → tự sắp lại theo khóa (cùng thuật toán section.js); khóa không khớp thì không tin.
      const src = C.scrambleKeySource(parsed, url);
      if (!src) return null;
      let key = src.key;
      if (src.url) {
        const kr = await fetch(src.url, { credentials: 'include' });
        if (!kr.ok) return null;
        key = await kr.text();
      }
      if (!key || !C.descramble(parsed, key)) return null;
    }
    const page = C.extractPage(parsed, url);
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
      // Không đợi onload (ảnh, quảng cáo, analytics): thăm dò ngay, có nội dung rồi thì settle() lo phần đợi script.
      const started = Date.now();
      const poll = () => {
        if (done) return;
        let d = null;
        try { d = fr.contentDocument; } catch (e) { d = null; }
        if (!d) { loadViaFetch(url).then(finish, () => finish(null)); return; }
        const page = C.extractPage(d, url);
        if (page.challenge) { finish(page); return; }
        if (C.han(page.paragraphs.join('')) > 20) { settle(d).then(() => finish(C.extractPage(d, url)), () => finish(null)); return; }
        if (Date.now() - started > 20000) { finish(page); return; }
        setTimeout(poll, 150);
      };
      fr.src = url;
      document.body.appendChild(fr);
      setTimeout(poll, 150);
    });
  }

  const sameText = (a, b) => a.paragraphs.join('\n') === b.paragraphs.join('\n');

  /** Đường nhanh: fetch HTML + tự giải mã (không mở iframe, không đợi tải trang). Chỉ dùng khi đã TỰ KIỂM CHỨNG:
   *  chương đầu của mỗi lượt (và cứ 20 chương một lần) tải cả hai đường, so từng đoạn; lệch dù chỉ một đoạn → tắt đường nhanh, dùng iframe. */
  async function loadPage(url) {
    const f = s.fast;
    f.n += 1;
    const verify = f.ok === null || (f.ok && f.n % 20 === 0);
    if (f.ok && !verify) {
      try {
        const p = await loadViaFetch(url);
        if (p && !p.challenge && p.paragraphs.length) { f.pending.push(url); f.last = { url, page: p }; return p; }
      } catch (e) { /* rơi về iframe */ }
    }
    let framed = null;
    try { framed = await loadViaFrame(url); } catch (e) { framed = null; }
    if (verify && framed && !framed.challenge && framed.paragraphs.length) {
      let fp = null;
      try { fp = await loadViaFetch(url); } catch (e) { fp = null; }
      const was = f.ok;
      f.ok = !!(fp && !fp.challenge && fp.paragraphs.length && sameText(fp, framed));
      if (was && !f.ok) await repairPending(); // lệch giữa chừng → các chương đã lưu bằng đường nhanh từ lần kiểm trước đều bị nghi
      else if (f.ok) f.pending = [];
    }
    return framed;
  }

  /** Tải lại bằng iframe (đường chuẩn) các chương đã lưu bằng đường nhanh mà chưa được kiểm chứng; không tải được thì hạ về “bản cũ” (△) để chọn tải lại sau. */
  async function repairPending() {
    const urls = s.fast.pending.splice(0);
    let fixed = 0;
    for (let i = 0; i < urls.length; i += 1) {
      say(`Phát hiện đường nhanh lệch — tải lại chương đã lưu bằng đường chuẩn (${i + 1}/${urls.length})…`);
      await sleep(DELAY_MIN + Math.floor(Math.random() * DELAY_JITTER));
      let p = null;
      try { p = await loadViaFrame(urls[i]); } catch (e) { p = null; }
      if (p && !p.challenge && p.paragraphs.length) { await saveChapter(urls[i], p); fixed += 1; } else if (s.chap[urls[i]]) s.chap[urls[i]].v = 1;
    }
    await persistMeta();
    s.fastNote = `Đường nhanh bị lệch: đã tải lại ${fixed}/${urls.length} chương đã lưu bằng đường chuẩn${fixed < urls.length ? `, ${urls.length - fixed} chương hạ về △ (chọn “Chọn chương bản cũ” để tải lại)` : ''}.`;
  }

  /** Cuối lượt: kiểm lại chương nhanh gần nhất bằng đường chuẩn để các chương cuối (chưa tới mốc kiểm 10) cũng được xác nhận. */
  async function finalCheck() {
    const f = s.fast;
    if (!f.ok || !f.pending.length || !f.last) return;
    say('Đang kiểm tra lại chương cuối bằng đường chuẩn…');
    let framed = null;
    try { framed = await loadViaFrame(f.last.url); } catch (e) { framed = null; }
    if (!framed || framed.challenge || !framed.paragraphs.length) return; // không kiểm được → giữ nguyên, không kết luận
    if (sameText(f.last.page, framed)) f.pending = [];
    else { f.ok = false; await repairPending(); }
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
    s.chap[url] = { t: title, k, at: new Date().toISOString(), v: SCRAPE_V };
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
    const volByUrl = new Map(s.toc.map((c) => [C.stripHash(c.url), c.vol]));
    chapters.forEach((c) => { const v = volByUrl.get(C.stripHash(c.url)); if (v) c.vol = v; });
    const bytes = await C.buildEpub({ title: s.info.title, bookKey: s.bookKey, cover, chapters });
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
  /** Đánh dấu chương đang tải: danh sách tự nhảy sang đúng trang (nếu phân trang) và cuộn tới dòng đó. */
  function markCurrent(url) {
    s.current = url;
    s.follow = true;
    const i = s.toc.findIndex((c) => c.url === url);
    if (i >= 0 && !s.filter.trim()) s.offset = Math.floor(i / LIST_PAGE) * LIST_PAGE;
  }

  async function runLoop(nextTask, limitNote) {
    s.running = true; s.stop = false;
    s.fast = { ok: null, n: 0, pending: [], last: null };
    s.fastNote = '';
    let got = 0;
    let reason = '';
    let first = true;
    try {
      while (true) {
        const t = nextTask();
        if (!t) { reason = limitNote || 'Hết danh sách.'; break; }
        if (s.stop) { reason = 'Đã dừng.'; break; }
        let page = t.live && s.livePage;
        if (page) { markCurrent(t.url); await settle(document); page = C.extractPage(document, here); s.livePage = page; }
        if (!page) {
          if (!first) await sleep(DELAY_MIN + Math.floor(Math.random() * DELAY_JITTER));
          if (s.stop) { reason = 'Đã dừng.'; break; }
          markCurrent(t.url);
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
        s.sel.delete(t.url); // đã tải xong → tự bỏ chọn
        if (t.onPage) t.onPage(page);
        say(`Đã lưu ${got} chương mới… (${Object.keys(s.chap).length} tổng)${s.fast.ok ? ' · chế độ nhanh' : ''}`);
      }
    } catch (err) {
      reason = `⚠ Lỗi: ${err && err.message ? err.message : err}`;
    }
    try { await finalCheck(); } catch (err) { /* kiểm cuối lỗi → bỏ qua */ }
    s.running = false;
    s.current = null;
    say(`${reason} (+${got} chương, đã lưu trong extension)${s.fastNote ? `\n${s.fastNote}` : ''}`.trim());
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
    if (ui.mode) HN().setMode(ui.mode);
    if (ui.reader) HN().enable();
    await settle(document);
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
