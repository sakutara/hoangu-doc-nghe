// Chỉ chèn panel vào tab hiện tại khi người dùng bấm biểu tượng (activeTab) — không chạy nền trên mọi trang.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['core.js', 'content.js'] });
  } catch (err) {
    console.warn('HoaNgữ: không chèn được vào trang này', err);
  }
});
