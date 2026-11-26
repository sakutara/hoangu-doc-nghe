/* Trang “Kho truyện” (manage.html): duyệt, xem, xuất và xoá dữ liệu các truyện đã cào, gom theo truyện.
 * Đọc/ghi thẳng chrome.storage.local theo cùng sơ đồ key với content.js (HNCore.STORE). Không gọi mạng. */
(function () {
  const C = window.HNCore;
  const S = C.STORE;
  const ls = chrome.storage.local;
  const PAGE = 200;
  const BATCH = 200;
  const SCRAPE_V = 2; // khớp content.js: chương lưu trước bản này hiện △

  const st = {
    books: [], sel: null, q: '', sort: 'title', chapQ: '', chapSel: new Set(), offset: 0, total: 0, orphans: [], busy: false,
  };
  const $ = (id) => document.getElementById(id);

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'checked' || k === 'disabled' || k === 'indeterminate') e[k] = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((k) => { if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); });
    return e;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  };
  const coverSrc = (c) => (c && /^image\/[\w.+-]+$/.test(c.mime) && c.b64 ? `data:${c.mime};base64,${c.b64}` : null);
  const initial = (t) => (Array.from(String(t || '?').trim())[0] || '?');
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const allKeys = async () => (ls.getKeys ? ls.getKeys() : Object.keys(await ls.get(null)));

  // ---------- đọc kho ----------
  async function load() {
    const keys = await allKeys();
    const got = await ls.get(S.reg);
    const reg = Array.isArray(got[S.reg]) ? got[S.reg] : [];
    // Hợp sổ đăng ký với các key hn:book:* (dữ liệu bản cũ, hoặc sổ bị lệch) để không sót truyện nào.
    const fromKeys = keys.filter((k) => k.startsWith('hn:book:')).map((k) => k.slice('hn:book:'.length));
    const bookKeys = [...new Set([...reg, ...fromKeys])];
    const books = [];
    for (const b of bookKeys) {
      const r = await ls.get([S.book(b), S.chap(b), S.toc(b), S.cover(b)]);
      const chap = r[S.chap(b)] || {};
      const toc = r[S.toc(b)] || [];
      if (!r[S.book(b)] && !Object.keys(chap).length && !toc.length) continue; // chỉ còn tên trong sổ
      const info = r[S.book(b)] || { title: b };
      const bytes = ls.getBytesInUse ? await ls.getBytesInUse(C.bookStorageKeys(b, chap)) : 0;
      books.push({
        key: b, info, chap, toc, cover: r[S.cover(b)] || null, bytes,
        count: Object.keys(chap).length, old: Object.values(chap).filter((c) => (c.v || 0) < SCRAPE_V).length,
      });
    }
    const chaps = Object.fromEntries(books.map((x) => [x.key, x.chap]));
    st.books = books;
    st.orphans = C.orphanBodyKeys(keys, chaps);
    st.total = ls.getBytesInUse ? await ls.getBytesInUse(null) : 0;
    if (st.sel && !books.some((x) => x.key === st.sel)) { st.sel = null; st.chapSel.clear(); }
    if (!st.sel && books.length) st.sel = sorted()[0].key;
    render();
  }

  function sorted() {
    const q = st.q.trim().toLowerCase();
    const list = st.books.filter((b) => !q || String(b.info.title).toLowerCase().includes(q) || b.key.toLowerCase().includes(q));
    const by = {
      title: (a, b) => String(a.info.title).localeCompare(String(b.info.title), 'zh'),
      updated: (a, b) => String(b.info.updatedAt || '').localeCompare(String(a.info.updatedAt || '')),
      size: (a, b) => b.bytes - a.bytes,
      count: (a, b) => b.count - a.count,
    }[st.sort];
    return list.sort(by);
  }
  const current = () => st.books.find((b) => b.key === st.sel) || null;

  // ---------- giao diện ----------
  function render() {
    $('usage').textContent = `${st.books.length} truyện · ${st.books.reduce((n, b) => n + b.count, 0)} chương · ${C.fmtBytes(st.total)} đang dùng`;
    const orph = $('orphans');
    orph.hidden = !st.orphans.length;
    orph.textContent = `Dọn ${st.orphans.length} chương mồ côi`;
    orph.title = 'Nội dung chương còn trong kho nhưng không thuộc truyện nào (sót lại sau khi xoá/di trú). Xoá để giải phóng dung lượng.';
    renderList();
    renderDetail();
  }

  function renderList() {
    const ul = $('books');
    const list = sorted();
    ul.replaceChildren(...(list.length ? list.map((b) => {
      const pct = b.toc.length ? Math.round((Math.min(b.count, b.toc.length) / b.toc.length) * 100) : 0;
      const src = coverSrc(b.cover);
      return el('li', null, el('button', {
        class: 'book', type: 'button', 'aria-current': b.key === st.sel ? 'true' : 'false',
        onclick: () => { if (st.sel !== b.key) { st.sel = b.key; st.chapSel.clear(); st.chapQ = ''; st.offset = 0; } render(); },
      },
      el('span', { class: 'thumb' }, src ? el('img', { src, alt: '' }) : initial(b.info.title)),
      el('span', { class: 'book-main' },
        el('span', { class: 'book-title' }, b.info.title),
        el('span', { class: 'meta' }, `${b.count} chương${b.toc.length ? ` / ${b.toc.length}` : ''} · ${C.fmtBytes(b.bytes)}`),
        el('span', { class: 'meta' }, hostOf(b)),
        b.toc.length ? el('span', { class: 'bar', title: `${pct}% mục lục đã lưu` }, el('i', { style: `width:${pct}%` })) : null)));
    }) : [el('li', { class: 'empty' }, st.books.length ? 'Không có truyện khớp.' : 'Chưa có truyện nào được cào.')]));
  }

  function hostOf(b) {
    try { return new URL(b.info.origin || b.key).host; } catch (e) { return ''; }
  }

  function chapRows(b) {
    const q = st.chapQ.trim().toLowerCase();
    return C.orderChapters(b.key, b.chap, b.toc).filter((r) => !q || r.title.toLowerCase().includes(q) || String(r.pos) === q);
  }

  function renderDetail() {
    const box = $('detail');
    const b = current();
    if (!b) {
      box.replaceChildren(el('div', { class: 'empty' }, 'Mở trang truyện, bấm biểu tượng HoaNgữ rồi tải chương — truyện sẽ hiện ở đây.'));
      return;
    }
    const src = coverSrc(b.cover);
    const isHttp = /^https?:\/\//.test(b.key);
    const head = el('div', { class: 'head' },
      el('div', { class: 'cover' }, src ? el('img', { src, alt: 'Ảnh bìa' }) : initial(b.info.title)),
      el('div', { class: 'head-main' },
        el('h1', null, b.info.title),
        el('div', { class: 'src' }, isHttp ? el('a', { href: b.key, target: '_blank', rel: 'noopener noreferrer' }, b.key) : b.key),
        el('div', { class: 'stats' },
          el('span', null, el('b', null, b.count), ' chương đã lưu'),
          el('span', null, el('b', null, b.toc.length || '?'), ' trong mục lục'),
          el('span', null, el('b', null, C.fmtBytes(b.bytes))),
          b.old ? el('span', { class: 'old', title: 'Lưu bằng bản cào cũ — nên tải lại trong panel' }, `△ ${b.old} chương bản cũ`) : null,
          el('span', { class: 'meta' }, `Cập nhật ${fmtDate(b.info.updatedAt)}`)),
        el('div', { class: 'actions' },
          el('button', { class: 'btn pri', type: 'button', disabled: st.busy || !b.count, onclick: () => exportEpub(b) }, `Xuất EPUB (${b.count})`),
          b.cover ? el('button', { class: 'btn ghost', type: 'button', disabled: st.busy, onclick: () => removeCover(b) }, 'Gỡ ảnh bìa') : null,
          el('button', { class: 'btn danger', type: 'button', disabled: st.busy, onclick: () => deleteBook(b) }, 'Xoá cả truyện'))));

    const rows = chapRows(b);
    if (st.offset >= rows.length) st.offset = Math.max(0, Math.floor((rows.length - 1) / PAGE) * PAGE);
    const page = rows.slice(st.offset, st.offset + PAGE);
    const pageSel = page.filter((r) => st.chapSel.has(r.url)).length;
    const nSel = st.chapSel.size;

    const search = el('input', {
      type: 'search', placeholder: 'Lọc chương theo tiêu đề hoặc số…', value: st.chapQ, 'aria-label': 'Lọc chương',
      oninput: (e) => { st.chapQ = e.target.value; st.offset = 0; renderDetail(); const i = $('detail').querySelector('.chap-tools input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); },
    });
    const tools = el('div', { class: 'chap-tools' },
      search,
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { rows.forEach((r) => st.chapSel.add(r.url)); renderDetail(); } }, `Chọn ${st.chapQ ? 'kết quả lọc' : 'tất cả'} (${rows.length})`),
      b.old ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { rows.filter((r) => r.v < SCRAPE_V).forEach((r) => st.chapSel.add(r.url)); renderDetail(); } }, 'Chọn bản cũ') : null,
      nSel ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { st.chapSel.clear(); renderDetail(); } }, 'Bỏ chọn') : null,
      el('span', { class: 'count' }, nSel ? `Đã chọn ${nSel}` : ''),
      el('button', { class: 'btn', type: 'button', disabled: st.busy || !nSel, onclick: () => exportEpub(b, [...st.chapSel]) }, 'Xuất đã chọn'),
      el('button', { class: 'btn danger', type: 'button', disabled: st.busy || !nSel, onclick: () => deleteChapters(b, [...st.chapSel]) }, `Xoá ${nSel || ''} chương`));

    const headCk = el('input', {
      type: 'checkbox', 'aria-label': 'Chọn cả trang', checked: page.length && pageSel === page.length, indeterminate: pageSel > 0 && pageSel < page.length,
      onchange: (e) => { page.forEach((r) => (e.target.checked ? st.chapSel.add(r.url) : st.chapSel.delete(r.url))); renderDetail(); },
    });
    let lastVol = null;
    const body = [];
    page.forEach((r) => {
      if (r.vol && r.vol !== lastVol) { lastVol = r.vol; body.push(el('tr', { class: 'vol' }, el('td', { colspan: 5 }, r.vol))); }
      const on = st.chapSel.has(r.url);
      body.push(el('tr', { class: `row${on ? ' sel' : ''}` },
        el('td', { class: 'ck' }, el('input', { type: 'checkbox', checked: on, 'aria-label': `Chọn ${r.title}`, onchange: (e) => { if (e.target.checked) st.chapSel.add(r.url); else st.chapSel.delete(r.url); renderDetail(); } })),
        el('td', { class: 'num' }, r.pos != null ? r.pos : '—'),
        el('td', { class: 't', title: 'Xem nội dung', onclick: () => preview(r) }, r.title),
        el('td', { class: 'at' }, fmtDate(r.at)),
        el('td', { class: 'flag' }, r.v < SCRAPE_V ? el('span', { class: 'old', title: 'Bản cào cũ — nên tải lại' }, '△') : el('span', { title: 'Đã lưu', style: 'color:var(--ok)' }, '✓'))));
    });
    const table = rows.length
      ? el('table', null,
        el('thead', null, el('tr', null, el('th', null, headCk), el('th', null, '#'), el('th', null, 'Chương'), el('th', { class: 'at' }, 'Lưu lúc'), el('th', null, ''))),
        el('tbody', null, body))
      : el('div', { class: 'empty' }, b.count ? 'Không có chương khớp.' : 'Truyện chưa có chương nào được lưu (chỉ có mục lục).');
    const pager = rows.length > PAGE ? el('div', { class: 'pager' },
      el('button', { class: 'btn ghost', type: 'button', disabled: !st.offset, onclick: () => { st.offset -= PAGE; renderDetail(); } }, '‹ Trước'),
      `${st.offset + 1}–${Math.min(rows.length, st.offset + PAGE)} / ${rows.length}`,
      el('button', { class: 'btn ghost', type: 'button', disabled: st.offset + PAGE >= rows.length, onclick: () => { st.offset += PAGE; renderDetail(); } }, 'Sau ›')) : null;

    box.replaceChildren(el('div', { class: 'card' }, head, tools, table, pager));
  }

  // ---------- thao tác ----------
  async function busy(fn) {
    st.busy = true; render();
    try { await fn(); } catch (err) { toast(`⚠ Lỗi: ${err && err.message ? err.message : err}`); }
    st.busy = false;
    await load();
  }

  async function preview(r) {
    const got = await ls.get(r.key);
    const b = got[r.key];
    $('pv-title').textContent = r.title;
    const out = [];
    if (!b || C.stripHash(b.url || '') !== C.stripHash(r.url)) out.push(el('p', { class: 'old' }, 'Không tìm thấy nội dung chương này trong kho (đã mất). Mở panel trên trang truyện để tải lại.'));
    else if (Array.isArray(b.blocks) && b.blocks.length) {
      b.blocks.forEach((x) => out.push(el(x && /^h[1-6]$/.test(x.tag) ? 'h3' : 'p', null, (x && x.text) || '')));
    } else (b.paragraphs || []).forEach((p) => out.push(el('p', null, p)));
    $('pv-body').replaceChildren(...out);
    $('preview').showModal();
    $('pv-body').scrollTop = 0;
  }

  async function readBodies(rows) {
    const chapters = [];
    let missing = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      const got = await ls.get(part.map((r) => r.key));
      part.forEach((r) => {
        const b = got[r.key];
        if (b && C.stripHash(b.url || '') === C.stripHash(r.url)) chapters.push({ ...b, vol: r.vol || undefined }); else missing += 1;
      });
    }
    return { chapters, missing };
  }

  function exportEpub(b, onlyUrls) {
    return busy(async () => {
      const only = onlyUrls && new Set(onlyUrls);
      const rows = C.orderChapters(b.key, b.chap, b.toc).filter((r) => !only || only.has(r.url));
      toast('Đang gom file…');
      const { chapters, missing } = await readBodies(rows);
      if (!chapters.length) { toast(`⚠ Cả ${missing} chương đều mất nội dung.`); return; }
      const cover = coverSrc(b.cover) ? { mime: b.cover.mime, data: fromB64(b.cover.b64) } : null;
      const bytes = await C.buildEpub({ title: b.info.title, bookKey: b.key, genres: b.info.genres, description: b.info.description, cover, chapters });
      const name = `${C.safeName(b.info.title)}${only ? `-${chapters.length}ch` : ''}.epub`;
      const u = URL.createObjectURL(new Blob([bytes], { type: 'application/epub+zip' }));
      const a = el('a', { href: u, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 15000);
      toast(`Đã xuất ${chapters.length} chương → ${name}${missing ? `\n⚠ ${missing} chương mất nội dung, bị bỏ qua.` : ''}`);
    });
  }

  function deleteChapters(b, urls) {
    if (!urls.length) return null;
    if (!confirm(`Xoá ${urls.length} chương đã lưu của “${b.info.title}” khỏi extension?\nMục lục vẫn giữ — có thể tải lại chúng trong panel. Không hoàn tác được.`)) return null;
    return busy(async () => {
      const drop = new Set(urls);
      const got = await ls.get([S.chap(b.key), S.idx]);
      const chap = { ...(got[S.chap(b.key)] || b.chap) };
      const keys = [];
      urls.forEach((u) => { if (chap[u]) keys.push(C.chapterBodyKey(b.key, chap[u], u)); delete chap[u]; });
      await ls.remove(keys);
      await ls.set({ [S.chap(b.key)]: chap, [S.idx]: C.pruneIndex(got[S.idx], b.key, drop) });
      st.chapSel.clear();
      toast(`Đã xoá ${keys.length} chương.`);
    });
  }

  function deleteBook(b) {
    if (!confirm(`Xoá TOÀN BỘ dữ liệu của “${b.info.title}” (${b.count} chương, mục lục, ảnh bìa, ${C.fmtBytes(b.bytes)}) khỏi extension?\nFile EPUB đã tải xuống không bị ảnh hưởng. Không hoàn tác được.`)) return null;
    return busy(async () => {
      const got = await ls.get([S.chap(b.key), S.reg, S.idx]);
      const chap = { ...b.chap, ...(got[S.chap(b.key)] || {}) };
      await ls.remove(C.bookStorageKeys(b.key, chap));
      const reg = Array.isArray(got[S.reg]) ? got[S.reg].filter((k) => k !== b.key) : [];
      await ls.set({ [S.reg]: reg, [S.idx]: C.pruneIndex(got[S.idx], b.key) });
      st.sel = null; st.chapSel.clear();
      toast(`Đã xoá “${b.info.title}”.`);
    });
  }

  function removeCover(b) {
    if (!confirm(`Gỡ ảnh bìa của “${b.info.title}”?`)) return null;
    return busy(async () => { await ls.remove(S.cover(b.key)); toast('Đã gỡ ảnh bìa.'); });
  }

  function cleanOrphans() {
    const n = st.orphans.length;
    if (!n || !confirm(`Xoá ${n} chương mồ côi (nội dung không thuộc truyện nào)?\nNếu đang có truyện bị mất chương, hãy thử “Khôi phục chương mất” trong panel trước. Không hoàn tác được.`)) return null;
    return busy(async () => { await ls.remove(st.orphans); toast(`Đã dọn ${n} chương mồ côi.`); });
  }

  // ---------- khởi tạo ----------
  $('q').addEventListener('input', (e) => { st.q = e.target.value; renderList(); });
  $('sort').addEventListener('change', (e) => { st.sort = e.target.value; renderList(); });
  $('reload').addEventListener('click', () => load());
  $('orphans').addEventListener('click', () => cleanOrphans());
  // Panel ở tab khác đang tải chương → tự làm mới (gộp nhiều thay đổi liên tiếp).
  let changeTimer = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || st.busy || !Object.keys(changes).some((k) => k.startsWith('hn:'))) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { if (!document.querySelector('dialog[open]')) load(); }, 1500);
  });
  load().catch((err) => { $('usage').textContent = `⚠ Không đọc được kho: ${err.message}`; });
}());
