export type Fetcher = (url: string) => Promise<Response>;

export const DEFAULT_PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

/** Trang được Cloudflare (hoặc tương tự) chặn bằng challenge: client không phải trình duyệt thật không qua được. */
export class BotChallengeError extends Error {
  readonly kind = 'bot_challenge' as const;
  constructor(url: string) {
    super(`Trang ${url} được Cloudflare bảo vệ (bot challenge) — dùng chế độ “Tải qua trình duyệt”.`);
    this.name = 'BotChallengeError';
  }
}

const CHALLENGE_BODY_RE = /Just a moment|challenges\.cloudflare\.com|cf-chl-|_cf_chl_opt/i;

async function isChallenge(res: Response): Promise<boolean> {
  if (res.headers.get('cf-mitigated')?.toLowerCase() === 'challenge') return true;
  if (res.status !== 403 && res.status !== 503) return false;
  try { return CHALLENGE_BODY_RE.test((await res.text()).slice(0, 8192)); } catch { return false; }
}

function decode(buf: ArrayBuffer, contentType: string | null): string {
  const declared = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (declared && /gb|big5/.test(declared)) return new TextDecoder('gb18030').decode(buf);
  if (/charset=["']?(gbk|gb2312|gb18030)/i.test(utf8.slice(0, 2048))) return new TextDecoder('gb18030').decode(buf);
  return utf8;
}

/** Thử fetch trực tiếp, rồi lần lượt qua các CORS proxy. Giải mã UTF-8 / GB18030. */
export async function fetchHtml(
  url: string, fetcher: Fetcher = (u) => fetch(u), proxies = DEFAULT_PROXIES,
): Promise<string> {
  const attempts = [url, ...proxies.map((p) => p(url))];
  let lastErr = 'unknown';
  let challenged = false;
  for (const target of attempts) {
    try {
      const res = await fetcher(target);
      if (!res.ok) {
        if (await isChallenge(res)) challenged = true;
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      return decode(await res.arrayBuffer(), res.headers.get('content-type'));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  if (challenged) throw new BotChallengeError(url);
  throw new Error(`Không tải được ${url}: ${lastErr}`);
}
