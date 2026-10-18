import { sanitizeHtmlToPlainText } from '../epub/PlainTextSanitizer';

export interface ExtractedChapterResult {
  title: string;
  paragraphs: string[];
  nextChapterUrl?: string;
  hasNextChapter: boolean;
}

const NEXT_RE = /下一章|下一页|下章|下一节|^\s*next\s*$/i;
const CONTENT_RE = [
  /<div[^>]*id=["'](?:content|chaptercontent)["'][^>]*>([\s\S]*?)<\/div>/i,
  /<div[^>]*class=["'][^"']*(?:Readarea|chapter-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  /<article[^>]*>([\s\S]*?)<\/article>/i,
];

const hanCount = (s: string) => (s.match(/[一-鿿]/g) ?? []).length;

function pickContentHtml(html: string): string {
  for (const re of CONTENT_RE) {
    const m = re.exec(html);
    if (m && hanCount(m[1]) > 0) return m[1];
  }
  // fallback: khối <div> có mật độ chữ Hán cao nhất
  let best = html;
  let bestScore = -1;
  for (const m of html.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)) {
    const score = hanCount(m[1]);
    if (score > bestScore) { bestScore = score; best = m[1]; }
  }
  return best;
}

function findNextUrl(html: string, pageUrl: string): string | undefined {
  const byId = /<a\b[^>]*\bid=["']next["'][^>]*>/i.exec(html)?.[0];
  const idHref = byId && /href=["']([^"']+)["']/i.exec(byId)?.[1];
  if (idHref) {
    try { return new URL(idHref, pageUrl).toString(); } catch { return undefined; }
  }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(m[1])?.[1];
    if (!href) continue;
    const text = m[2].replace(/<[^>]+>/g, '');
    if (NEXT_RE.test(text) || /rel=["']next["']/i.test(m[1])) {
      try { return new URL(href, pageUrl).toString(); } catch { return undefined; }
    }
  }
  return undefined;
}

function isTocUrl(next: string, pageUrl: string): boolean {
  const u = new URL(next);
  return next === pageUrl || u.pathname.endsWith('/') || /index\.html?$/i.test(u.pathname);
}

export function extractChapterFromHtml(html: string, pageUrl: string): ExtractedChapterResult {
  const cleaned = html.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '').replace(/<div[^>]*class=["'][^"']*(?:ads|bottem)[^"']*["'][\s\S]*?<\/div>/gi, '');
  const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(cleaned) ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(cleaned);
  const title = titleMatch ? sanitizeHtmlToPlainText(titleMatch[1]).paragraphs.join(' ') : '';
  const paragraphs = sanitizeHtmlToPlainText(pickContentHtml(cleaned)).paragraphs.filter((p) => p !== title);
  const next = findNextUrl(cleaned, pageUrl);
  const hasNextChapter = !!next && !isTocUrl(next, pageUrl);
  return { title, paragraphs, nextChapterUrl: hasNextChapter ? next : undefined, hasNextChapter };
}

export function extractTocLinksFromHtml(html: string, tocUrl: string): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (!/第.{1,9}[章节節回]|^\d+[.、]/.test(title)) continue;
    try {
      const url = new URL(m[1], tocUrl).toString();
      if (!seen.has(url)) { seen.add(url); out.push({ title, url }); }
    } catch { /* bỏ link hỏng */ }
  }
  return out;
}
