export function speakChinese(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}
