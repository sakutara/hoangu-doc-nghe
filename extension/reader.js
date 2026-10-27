/* Đọc từ: bật lên thì bấm vào chữ Hán bất kỳ trên trang để hiện popup giải nghĩa (cùng bộ tra từ với webapp:
 * SmartSegmenter + từ điển lõi + giáo trình đóng gói trong dict.js, cộng CC-CEDICT nạp từ data/cedict.json).
 * Mặc định phải giữ Alt khi bấm (bấm thường không bị can thiệp); có thể đổi sang bấm thường.
 * Link/nút/ô nhập vẫn hoạt động bình thường (không chặn). Từ đã lưu nằm trong chrome.storage.local. */
(function () {
  if (window.HNReader) return;

  const D = globalThis.HNDictLib;
  const SAVED_KEY = 'hn:saved';
  const CJK = /[㐀-鿿]/;
  const BLOCK_SEL = 'p,div,li,td,th,dd,dt,blockquote,article,section,h1,h2,h3,h4,h5,h6';
  const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|RT|RP)$/;
  const IGNORE_CLICK = 'a,button,input,textarea,select,summary,label,[contenteditable],[role="button"],[role="link"]';
  const WINDOW = 120; // số ký tự lấy quanh vị trí bấm để tách từ
  const LABELS = {
    core: 'Thông dụng', compound: 'Từ ghép', idiom: 'Thành ngữ', slang: 'Tiếng lóng mạng', gaming: 'Game / Truyện', loanword: 'Từ gốc Anh',
  };

  const state = { on: false, dict: 'idle', count: 0, mode: 'alt' }; // mode: 'alt' = giữ Alt + bấm mới tra (bấm thường không bị can thiệp); 'click' = bấm thường
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { /* bỏ qua */ } });

  let seg = null;
  let loading = null;
  let host = null;
  let pop = null;
  let current = null; // {entry, token}
  let saved = [];

  // ---------- từ điển ----------
  function segmenter() {
    if (!seg && D) seg = new D.SmartSegmenter(D.LEXICON);
    return seg;
  }

  /** Nạp CC-CEDICT (lười, một lần). Từ điển lõi dùng được ngay, CEDICT bổ sung khi nạp xong. */
  function loadDict() {
    const s = segmenter();
    if (!s) { state.dict = 'error'; emit(); return Promise.resolve(); }
    if (!loading) {
      state.dict = 'loading'; emit();
      loading = fetch(chrome.runtime.getURL('data/cedict.json'))
        .then((r) => { if (!r.ok) throw new Error(`cedict ${r.status}`); return r.json(); })
        .then((rows) => { state.count = s.addEntries(D.cedictToEntries(rows, s)); state.dict = 'ready'; emit(); })
        .catch(() => { state.dict = 'error'; loading = null; emit(); });
    }
    return loading;
  }

  // ---------- tìm chữ dưới con trỏ ----------
  /** Gom chữ của khối chứa node → {text, nodes:[{node,start,end}], offset} (offset: vị trí của ký tự được bấm trong text). */
  function contextAt(node, offset) {
    const el = node.parentElement;
    const block = (el && el.closest(BLOCK_SEL)) || el || document.body;
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && SKIP_TAGS.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let at = -1;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const data = n.nodeValue || '';
      if (n === node) at = text.length + offset;
      nodes.push({ node: n, start: text.length, end: text.length + data.length });
      text += data;
    }
    if (at < 0) return null;
    // Cắt cửa sổ quanh vị trí bấm để khối khổng lồ (cả chương trong một div) vẫn tra nhanh.
    const lo = Math.max(0, at - WINDOW);
    const hi = Math.min(text.length, at + WINDOW);
    return { text: text.slice(lo, hi), base: lo, nodes, offset: at - lo };
  }

  /** Range phủ [start,end) (theo toạ độ text của contextAt, đã cộng base). */
  function rangeFor(ctx, start, end) {
    const find = (pos, isEnd) => ctx.nodes.find((n) => (isEnd ? pos > n.start && pos <= n.end : pos >= n.start && pos < n.end));
    const a = find(start, false);
    const b = find(end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, start - a.start);
    r.setEnd(b.node, end - b.start);
    return r;
  }

  /** Tra từ tại (node, offset): {token, range} hoặc null nếu không phải chữ Hán. */
  function lookup(node, offset) {
    const s = segmenter();
    if (!s || !node || node.nodeType !== 3 || !CJK.test((node.nodeValue || '')[offset] || '')) return null;
    const ctx = contextAt(node, offset);
    if (!ctx) return null;
    const token = s.lookupAtPosition(ctx.text, ctx.offset);
    if (!token) return null;
    return { token, range: rangeFor(ctx, ctx.base + token.startIndex, ctx.base + token.endIndex) };
  }

  /** Vị trí ký tự nằm đúng dưới điểm (x,y): {node, offset} hoặc null (offset của caret có thể rơi sang ký tự kề → kiểm tra hình học). */
  function charAtPoint(x, y) {
    let node = null;
    let off = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; off = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; off = r.startOffset; }
    }
    if (!node || node.nodeType !== 3) return null;
    const data = node.nodeValue || '';
    for (const cand of [off, off - 1]) {
      if (cand < 0 || cand >= data.length || !CJK.test(data[cand])) continue;
      const r = document.createRange();
      r.setStart(node, cand);
      r.setEnd(node, cand + 1);
      const hit = [...r.getClientRects()].some((q) => x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 1 && y <= q.bottom + 1);
      if (hit) return { node, offset: cand };
    }
    return null;
  }

  // ---------- đánh dấu từ ----------
  function highlight(range) {
    try {
      if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
      if (!document.getElementById('hn-hl-style')) {
        const st = document.createElement('style');
        st.id = 'hn-hl-style';
        st.textContent = '::highlight(hn-word){background:#fde68a;color:#111}';
        document.documentElement.appendChild(st);
      }
      if (range) CSS.highlights.set('hn-word', new Highlight(range)); else CSS.highlights.delete('hn-word');
    } catch (e) { /* trình duyệt cũ: bỏ đánh dấu */ }
  }

  // ---------- từ đã lưu ----------
  async function loadSaved() {
    try { saved = (await chrome.storage.local.get(SAVED_KEY))[SAVED_KEY] || []; } catch (e) { saved = []; }
    return saved;
  }
  const isSaved = (word) => saved.some((w) => w.simplified === word);
  async function toggleSaved(entry) {
    saved = isSaved(entry.simplified) ? saved.filter((w) => w.simplified !== entry.simplified) : [...saved, entry];
    try { await chrome.storage.local.set({ [SAVED_KEY]: saved }); } catch (e) { /* bỏ qua */ }
    emit();
    return isSaved(entry.simplified);
  }

  // ---------- popup ----------
  function ensurePopup() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'hoangu-reader-host';
    host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483646;display:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      :host{all:initial}
      .pop{width:320px;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;box-sizing:border-box;background:#fffaf0;color:#222;border:2px solid #b91c1c;border-radius:10px;padding:12px 14px;font:14px/1.45 sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35)}
      .top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .w{font-size:30px;font-weight:700;line-height:1.2}
      .x{cursor:pointer;border:0;background:none;font-size:22px;line-height:1;color:#666;padding:0 2px}
      .muted{color:#666;font-size:13px}.py{color:#b91c1c;font-size:17px;font-weight:600;margin-top:2px}
      ul{margin:6px 0 0;padding-left:20px}li{margin:1px 0}
      .chips{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}.chip{font-size:12px;padding:1px 8px;border-radius:99px;background:#fde68a;color:#78350f}.chip.i{background:#dbeafe;color:#1e3a8a}
      .part{margin-top:8px;border-top:1px solid #e5e5e5;padding-top:6px;font-size:13px}
      .btns{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
      button.b{cursor:pointer;padding:3px 10px;border:1px solid #b91c1c;background:#fff;color:#b91c1c;border-radius:5px;font:inherit}
      button.b.on{background:#b91c1c;color:#fff}.cap{text-transform:capitalize}
    </style><div class="pop" role="dialog" aria-label="Tra từ"></div>`;
    pop = sh.querySelector('.pop');
    document.documentElement.appendChild(host);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function popupHtml(token) {
    const e = token.entry;
    let h = `<div class="top"><div><div class="w" lang="zh-CN">${esc(token.text)}</div>${e && e.traditional && e.traditional !== e.simplified ? `<div class="muted">Phồn thể: ${esc(e.traditional)}</div>` : ''}</div><button class="x" data-a="close" aria-label="Đóng">×</button></div>`;
    if (!e) {
      h += `<p class="muted">${state.dict === 'loading' ? 'Từ điển đang tải… bấm lại sau giây lát.' : 'Chưa có trong từ điển offline.'}</p>`;
      return h;
    }
    h += `<div class="py">${esc(e.pinyin)}</div>`;
    if (e.hanViet) h += `<div>Hán-Việt: <b class="cap">${esc(e.hanViet)}</b></div>`;
    h += `<ul>${e.meanings.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
    h += `<div class="chips"><span class="chip">${esc(LABELS[e.category] || e.category)}</span>${e.englishOrigin ? `<span class="chip i">Gốc Anh: ${esc(e.englishOrigin)}</span>` : ''}</div>`;
    if (token.constituents && token.constituents.length) {
      h += `<div class="part"><b>Chữ thành phần</b><ul>${token.constituents.map((c) => `<li><b>${esc(c.simplified)}</b> · ${esc(c.pinyin)}${c.hanViet ? ` · <span class="cap">${esc(c.hanViet)}</span>` : ''} — ${esc(c.meanings[0] || '')}</li>`).join('')}</ul></div>`;
    }
    h += `<div class="btns"><button class="b" data-a="speak">🔊 Nghe phát âm</button><button class="b${isSaved(e.simplified) ? ' on' : ''}" data-a="save">${isSaved(e.simplified) ? '★ Đã lưu' : '☆ Lưu từ'}</button></div>`;
    return h;
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  }

  function closePopup() {
    if (host) host.style.display = 'none';
    current = null;
    highlight(null);
  }

  function showPopup(token, range, x, y) {
    ensurePopup();
    current = token;
    pop.innerHTML = popupHtml(token);
    pop.onclick = async (ev) => {
      const a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (a === 'close') closePopup();
      else if (a === 'speak') speak(token.text);
      else if (a === 'save' && token.entry) { await toggleSaved(token.entry); pop.innerHTML = popupHtml(token); }
    };
    host.style.display = 'block';
    const rect = range ? range.getBoundingClientRect() : { left: x, right: x, top: y, bottom: y };
    const w = Math.min(320, window.innerWidth - 16);
    const pr = pop.getBoundingClientRect();
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
    let top = rect.bottom + 8;
    if (top + pr.height > window.innerHeight - 8) top = Math.max(8, rect.top - pr.height - 8);
    host.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
    highlight(range);
  }

  // ---------- bật / tắt ----------
  function onClick(e) {
    if (!state.on || e.button !== 0 || e.defaultPrevented) return;
    if (state.mode === 'alt' && !e.altKey) return; // bấm thường: để yên cho tính năng của trang
    if (e.ctrlKey || e.metaKey || e.shiftKey) return; // tổ hợp phím của trình duyệt (mở tab mới, chọn…)
    const path = e.composedPath ? e.composedPath() : [];
    if (path.some((n) => n === host || (n && n.id === 'hoangu-panel-host'))) return; // bấm trong popup / panel
    const t = e.target;
    if (t && t.closest && t.closest(IGNORE_CLICK)) return;
    if (state.mode === 'click' && t && t.nodeType === 1 && getComputedStyle(t).cursor === 'pointer') return; // vùng trang tự làm thành nút bấm
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) return; // đang bôi đen để copy
    const hit = charAtPoint(e.clientX, e.clientY);
    const found = hit && lookup(hit.node, hit.offset);
    if (!found) { closePopup(); return; }
    showPopup(found.token, found.range, e.clientX, e.clientY);
  }
  const onKey = (e) => { if (e.key === 'Escape') closePopup(); };
  const onScroll = () => { if (current) closePopup(); };

  function enable() {
    if (state.on) return Promise.resolve();
    state.on = true;
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    emit();
    return Promise.all([loadSaved(), loadDict()]).then(() => emit());
  }

  function disable() {
    if (!state.on) return;
    state.on = false;
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, { capture: true });
    closePopup();
    emit();
  }

  window.HNReader = {
    state,
    enable,
    disable,
    setMode(m) { state.mode = m === 'click' ? 'click' : 'alt'; emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSaved() { return saved.slice(); },
    loadSaved,
    async removeSaved(word) {
      saved = saved.filter((w) => w.simplified !== word);
      try { await chrome.storage.local.set({ [SAVED_KEY]: saved }); } catch (e) { /* bỏ qua */ }
      emit();
    },
    // dùng cho test
    lookup,
    contextAt,
    useSegmenter(s) { seg = s; },
  };
}());
