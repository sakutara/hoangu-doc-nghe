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
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('job:')) return false;
  (async () => {
    if (msg.type === 'job:get') return getJob(tabId);
    if (msg.type === 'job:clear') { await clearJob(tabId); return true; }
    if (msg.type === 'job:reload') {
      // Lưu lượt tải dở rồi tải lại cả tab: trình duyệt nhận phiên/cookie mới, kiểm tra của trang (nếu có) chạy như bình thường.
      await chrome.storage.session.set({ [JOB(tabId)]: msg.job });
      await chrome.tabs.reload(tabId);
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
