const BLOCK_TAGS = ['script', 'style', 'svg', 'head', 'nav', 'figure', 'picture', 'video', 'audio', 'iframe', 'canvas', 'title'];
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Chỉ giữ chữ: bỏ ảnh, CSS, script và mọi thẻ HTML. */
export function sanitizeHtmlToPlainText(rawHtml: string): { title?: string; paragraphs: string[] } {
  let html = rawHtml;
  const titleMatch = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html) ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  for (const t of BLOCK_TAGS) html = html.replace(new RegExp(`<${t}[\\s\\S]*?</${t}>`, 'gi'), '');
  html = html.replace(/<img[^>]*>/gi, '');
  const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/[ \t　]+/g, ' ').trim();
  const title = titleMatch ? clean(titleMatch[1]) || undefined : undefined;
  const body = html
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, '\n');
  const paragraphs = decodeEntities(body.replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/[ \t　]+/g, ' ').trim())
    .filter((l) => l.length > 0);
  return { title, paragraphs };
}
