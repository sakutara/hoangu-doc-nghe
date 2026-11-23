// Chỉ chèn panel vào tab hiện tại khi người dùng bấm biểu tượng (activeTab) — không chạy nền trên mọi trang.
// Ngoại lệ: tab đang có lượt tải dở vì extension vừa tự tải lại trang (job trong storage.session) → tự chèn lại để tải tiếp.
const FILES = ['core.js', 'dict.js', 'reader.js', 'content.js'];
const JOB = (tabId) => `job:${tabId}`;

async function getJob(tabId) { return (await chrome.storage.session.get(JOB(tabId)))[JOB(tabId)] || null; }
async function clearJob(tabId) {
  await chrome.storage.session.remove(JOB(tabId));
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  chrome.action.setTitle({ tabId, title: 'HoaNgữ – Tải truyện' }).catch(() => {});
}

/** URL điều hướng an toàn: chỉ http/https và cùng origin với trang đã gửi yêu cầu (sender.url, hoặc tab.url nếu thiếu); không thì null. */
function safeTarget(url, sender) {
  try {
    const from = new URL(sender.url || (sender.tab && sender.tab.url));
    const to = new URL(url);
    if (!/^https?:$/.test(to.protocol) || to.origin !== from.origin) return null;
    return to.href;
  } catch (e) { return null; }
}

/** Chèn panel nếu tài liệu hiện tại chưa có (content.js tự bật/tắt panel khi chèn lần hai → phải kiểm tra trước). */
async function inject(tabId, { onlyIfMissing }) {
  if (onlyIfMissing) {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!window.__hoanguPanel });
    if (r && r.result) return;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await inject(tab.id, { onlyIfMissing: false });
    chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {});
  } catch (err) {
    console.warn('HoaNgữ: không chèn được vào trang này', err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Trang Kho truyện là options page → openOptionsPage tự chuyển tới tab đang mở nếu có.
  if (msg && msg.type === 'open:manage') { chrome.runtime.openOptionsPage().then(() => reply(true), () => reply(false)); return true; }
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('job:')) return false;
  (async () => {
    if (msg.type === 'job:get') return getJob(tabId);
    if (msg.type === 'job:clear') { await clearJob(tabId); return true; }
    if (msg.type === 'job:reload') {
      // Lưu lượt tải dở rồi mở lại trang. Không dùng chrome.tabs.reload: sau kiểm tra Cloudflare trang đang hiện là KẾT QUẢ POST,
      // reload sẽ bật hộp thoại “Confirm Form Resubmission” mà extension không bấm được. Điều hướng GET tới URL sạch (content.js gửi kèm msg.url) thì không có hộp thoại.
      await chrome.storage.session.set({ [JOB(tabId)]: msg.job });
      await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => { window.onbeforeunload = null; } }).catch(() => {});
      const target = safeTarget(msg.url, sender);
      if (target) await chrome.tabs.update(tabId, { url: target });
      else await chrome.tabs.reload(tabId, { bypassCache: false });
      return true;
    }
    return null;
  })().then(reply, (err) => reply({ error: String(err && err.message ? err.message : err) }));
  return true; // trả lời bất đồng bộ
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const job = await getJob(tabId);
  if (!job) return;
  try {
    await inject(tabId, { onlyIfMissing: true });
  } catch (err) {
    // Mất quyền chèn (vd. activeTab bị thu hồi sau khi tải lại) → nhờ người dùng bấm biểu tượng một lần; content.js thấy job và tải tiếp.
    chrome.action.setBadgeText({ tabId, text: '↻' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' }).catch(() => {});
    chrome.action.setTitle({ tabId, title: 'HoaNgữ – bấm để tải tiếp lượt đang dở' }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => { chrome.storage.session.remove(JOB(tabId)); });
