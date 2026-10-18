import {
  cap, chineseNumberToInt, type ChapterText, type Glossary, type ITranslationProvider,
} from './ChineseToVietNovelTranslator';

export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Bạn là dịch giả văn học Trung – Việt chuyên dịch tiểu thuyết mạng (tiên hiệp, huyền huyễn, đô thị, ngôn tình...).
Nguyên tắc:
- Đọc hiểu trọn từng câu, từng đoạn rồi mới viết lại bằng tiếng Việt tự nhiên, trôi chảy, giàu hình ảnh. TUYỆT ĐỐI không dịch word-by-word, không giữ trật tự từ tiếng Hoa khi tiếng Việt không nói như vậy.
- Giữ trọn ý, giọng điệu và sắc thái cảm xúc của nguyên tác; không thêm, không bớt tình tiết, không chú thích.
- Tên người, địa danh, môn phái, công pháp, cảnh giới, pháp bảo: dùng âm Hán-Việt viết hoa (林动 → Lâm Động, 青阳镇 → Thanh Dương trấn). Nếu đã có trong bảng thuật ngữ thì bắt buộc dùng đúng như bảng.
- Xưng hô theo bối cảnh và quan hệ nhân vật (cổ trang: ta/ngươi, huynh/đệ, sư phụ/đồ nhi; hiện đại: tôi/anh/em/cậu...).
- Thành ngữ: chuyển sang thành ngữ hoặc cách nói tương đương của tiếng Việt khi có.
- Giữ nguyên số đoạn: mỗi phần tử đầu vào tương ứng đúng một phần tử đầu ra, cùng thứ tự.
- Ghi vào "glossary" các tên riêng/thuật ngữ mới xuất hiện trong phần này cùng bản dịch đã dùng.`;

const STR = { type: 'STRING' };
const CHAPTER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STR,
    paragraphs: { type: 'ARRAY', items: STR },
    glossary: { type: 'ARRAY', items: { type: 'OBJECT', properties: { zh: STR, vi: STR }, required: ['zh', 'vi'] } },
  },
  required: ['title', 'paragraphs', 'glossary'],
  propertyOrdering: ['title', 'paragraphs', 'glossary'],
};
const TITLE_SCHEMA = { type: 'OBJECT', properties: { title: STR }, required: ['title'] };

interface ChunkResult {
  title: string;
  paragraphs: string[];
  glossary: Array<{ zh: string; vi: string }>;
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  /** Số ký tự Hán tối đa mỗi lượt gọi. */
  chunkChars?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Số lần tự chờ rồi gọi lại khi bị giới hạn tốc độ (429). */
  rateLimitRetries?: number;
}

/** Chia đoạn văn thành các khối liền nhau, mỗi khối ≤ maxChars (đoạn quá dài đứng riêng). */
export function chunkParagraphs(paragraphs: string[], maxChars: number): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [], len = 0;
  for (const p of paragraphs) {
    if (cur.length && len + p.length > maxChars) { chunks.push(cur); cur = []; len = 0; }
    cur.push(p);
    len += p.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

function parseRetryDelayMs(body: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

function describeHttpError(status: number, body: string): string {
  let detail = '';
  try { detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* body không phải JSON */ }
  if (status === 429) return 'Gemini báo hết hạn mức (429): gói miễn phí giới hạn số lượt mỗi phút/ngày. Đợi một lúc rồi bấm “Dịch tiếp từ điểm chết”.';
  if (status === 401 || status === 403 || /API.?key/i.test(detail)) return `Gemini từ chối API key (${status}). Kiểm tra lại key trong mục “Dịch bằng AI”.`;
  if (status === 404) return `Không tìm thấy model Gemini (404). Chọn model khác trong mục “Dịch bằng AI”.`;
  if (status >= 500) return `Máy chủ Gemini đang lỗi (${status}), thử lại sau.`;
  return `Gemini lỗi ${status}${detail ? `: ${detail.slice(0, 200)}` : ''}`;
}

/** Dịch theo ngữ cảnh cả đoạn bằng Gemini API (key miễn phí từ Google AI Studio). */
export class GeminiNovelTranslator implements ITranslationProvider {
  private model: string;
  private fetchImpl: NonNullable<GeminiOptions['fetchImpl']>;
  private sleep: NonNullable<GeminiOptions['sleep']>;

  constructor(private opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
    this.fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async generate<T>(prompt: string, schema: object): Promise<T> {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, responseMimeType: 'application/json', responseSchema: schema },
      }),
    };
    const url = `${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try { res = await this.fetchImpl(url, init); }
      catch { throw new Error('Không kết nối được tới Gemini (mất mạng?). Bấm “Dịch tiếp” khi có mạng.'); }
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
          promptFeedback?: { blockReason?: string };
        };
        const cand = data.candidates?.[0];
        const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        const reason = data.promptFeedback?.blockReason ?? cand?.finishReason;
        if (!text) throw new Error(`Gemini không trả về bản dịch${reason ? ` (${reason})` : ''}.`);
        try { return JSON.parse(text) as T; }
        catch { throw new Error(`Gemini trả về dữ liệu hỏng${reason && reason !== 'STOP' ? ` (${reason})` : ''}.`); }
      }
      const body = await res.text().catch(() => '');
      if (res.status === 429 && attempt < (this.opts.rateLimitRetries ?? 3)) {
        // Giới hạn theo phút: chờ đúng thời gian Gemini gợi ý (tối đa 60s) rồi gọi lại.
        await this.sleep(Math.min(parseRetryDelayMs(body) ?? 15000, 60000));
        continue;
      }
      throw new Error(describeHttpError(res.status, body));
    }
  }

  private buildPrompt(title: string, paras: string[], glossary: Glossary, prevVi: string[], fixNote: string): string {
    const text = title + paras.join('');
    const terms = Object.entries(glossary).filter(([zh]) => text.includes(zh));
    const parts: string[] = [];
    if (terms.length) parts.push(`Bảng thuật ngữ (bắt buộc dùng đúng):\n${terms.map(([zh, vi]) => `${zh} → ${vi}`).join('\n')}`);
    if (prevVi.length) parts.push(`Đoạn dịch ngay trước (chỉ để nối mạch văn, KHÔNG dịch lại):\n${prevVi.join('\n')}`);
    parts.push(title
      ? `Tiêu đề chương cần dịch (điền vào "title", ngắn gọn, viết hoa chữ đầu): ${title}`
      : 'Không có tiêu đề: để "title" là chuỗi rỗng.');
    parts.push(`Dịch ${paras.length} đoạn văn sau (mảng JSON, mỗi phần tử một đoạn) và trả về đúng ${paras.length} phần tử trong "paragraphs":\n${JSON.stringify(paras)}`);
    if (fixNote) parts.push(fixNote);
    return parts.join('\n\n');
  }

  private async translateChunk(title: string, paras: string[], glossary: Glossary, prevVi: string[]): Promise<ChunkResult> {
    let fixNote = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.generate<ChunkResult>(this.buildPrompt(title, paras, glossary, prevVi, fixNote), CHAPTER_SCHEMA);
      if (Array.isArray(r.paragraphs) && r.paragraphs.length === paras.length) return r;
      fixNote = `LƯU Ý: lần trước bạn trả về ${r.paragraphs?.length ?? 0} đoạn, sai. "paragraphs" phải có đúng ${paras.length} phần tử.`;
    }
    throw new Error(`Gemini trả về sai số đoạn (cần ${paras.length}), thử dịch tiếp lại.`);
  }

  async translateChapter(ch: ChapterText, glossary: Glossary): Promise<ChapterText & { glossary: Glossary }> {
    const g: Glossary = { ...glossary };
    // Số chương tự định dạng, chỉ nhờ Gemini dịch phần tên chương.
    const m = /^第\s*([零一二两三四五六七八九十百千\d]+)\s*[章节節回]\s*(.*)$/.exec(ch.title.trim());
    const num = m ? chineseNumberToInt(m[1]) : null;
    const titleZh = num !== null ? m![2].trim() : ch.title.trim();
    const chunks = chunkParagraphs(ch.paragraphs, this.opts.chunkChars ?? 4000);
    if (!chunks.length) chunks.push([]);
    let titleVi = '';
    const out: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const r = await this.translateChunk(i === 0 ? titleZh : '', chunks[i], g, out.slice(-2));
      if (i === 0) titleVi = (r.title ?? '').trim();
      out.push(...r.paragraphs.map((p) => p.trim()));
      for (const { zh, vi } of r.glossary ?? []) {
        if (zh?.trim() && vi?.trim() && !(zh.trim() in g)) g[zh.trim()] = vi.trim();
      }
    }
    const title = num !== null ? `Chương ${num}${titleVi ? `: ${cap(titleVi)}` : ''}` : cap(titleVi) || ch.title;
    return { title, paragraphs: out, glossary: g };
  }

  async translateBookTitle(zh: string): Promise<string> {
    const r = await this.generate<{ title: string }>(
      `Dịch tên truyện sau sang tiếng Việt theo âm Hán-Việt, viết hoa chữ cái đầu mỗi từ (ví dụ 凡人修仙传 → Phàm Nhân Tu Tiên Truyện). Điền vào "title".\nTên truyện: ${zh}`,
      TITLE_SCHEMA,
    );
    return r.title?.trim() || zh;
  }

  async translateChapterTitle(zh: string): Promise<string> {
    return (await this.translateChapter({ title: zh, paragraphs: [] }, {})).title;
  }

  async translateParagraphs(zh: string[]): Promise<string[]> {
    return (await this.translateChapter({ title: '', paragraphs: zh }, {})).paragraphs;
  }
}
