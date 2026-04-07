import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite';

export interface GeneratedPage {
  pageNumber: number;
  content: string;
}

export interface GenerationResult {
  title: string;
  author: string;
  summary: string;
  pages: GeneratedPage[];
}

type FormatType = 'mini' | 'pro' | 'ultra';

const FORMAT_PROMPTS: Record<FormatType, string> = {
  mini: `You are a master literary condensation engine. Your task is to compress an ENTIRE book from beginning to end into ~10% of its page count — covering the full arc, not cherry-picking random sections.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Count the total pages in the PDF. Produce EXACTLY ~10% of that number as output pages. For a 200-page book → 20 pages. For a 50-page book → 5 pages.
4. CRITICAL — FULL COVERAGE: Divide the entire book evenly across your output pages. If the book is 200 pages and you produce 20 output pages, each output page must cover roughly 10 consecutive original pages. Page 1 covers the book's beginning, your last page covers the book's ending. The reader must experience the complete journey from first page to last — no gaps, no skipped sections, no abrupt ending midway through.
5. STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count your words carefully. If a page is under 60 or over 80 words, rewrite it until it fits.
6. For each output page, condense that section into its core idea, turning point, or thesis. Skip supporting arguments, examples, anecdotes — keep only what's load-bearing.
7. Write in the author's voice. Every page should feel like a perfectly chosen excerpt.
8. Each page must flow naturally into the next, creating a coherent fast-paced read through the whole book.
9. End each page on tension or an unresolved idea — make the reader need the next page.
10. Never fabricate events or details not in the original text.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — EXACTLY 60-80 words" }
  ]
}`,

  pro: `You are a literary abridgment specialist. Your task is to retell an ENTIRE book from beginning to end in ~30% of its page count — preserving the full narrative arc at a faster pace, not extracting random highlights.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Count the total pages in the PDF. Produce EXACTLY ~30% of that number as output pages. For a 200-page book → 60 pages. For a 50-page book → 15 pages.
4. CRITICAL — FULL COVERAGE: Divide the entire book evenly across your output pages. If the book is 200 pages and you produce 60 output pages, each output page must cover roughly 3-4 consecutive original pages. Page 1 covers the book's opening, your last page covers the book's conclusion. The reader must travel through the complete book from start to finish — no chapters skipped, no storylines dropped, no ending left out.
5. STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count your words carefully. If a page is under 60 or over 80 words, rewrite it until it fits.
6. Preserve the narrative flow — arguments should build, characters should develop, ideas should layer. Include key examples and pivotal moments.
7. Write in the author's authentic voice and style — never flatten into generic prose.
8. Be vivid and sensory. Open each page with something that grabs attention.
9. End each page on a micro-cliffhanger or unresolved tension.
10. Never fabricate events or details not in the original text.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — EXACTLY 60-80 words" }
  ]
}`,

  ultra: `You are a literary rewriter who channels any author's voice. Your task is to rewrite EVERY page of this book in a condensed but complete form — nothing is left out, every page is covered.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce ONE output page for EVERY page in the original PDF. If the book has 200 pages, produce 200 output pages. Page 1 of output corresponds to page 1 of the book, and so on through to the very last page.
4. STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count your words carefully. If a page is under 60 or over 80 words, rewrite it until it fits.
5. Narratively retell each page's content in the author's style. Preserve ALL content — every argument, example, character moment, subplot. Nothing is cut.
6. Write in the author's authentic voice. Be vivid, sensory, emotionally resonant.
7. Each page must be self-contained and readable on its own, yet leave the reader hungry for more.
8. End each page on tension or an unresolved moment.
9. Never fabricate events or details not in the original text.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — EXACTLY 60-80 words" }
  ]
}`,
};

async function readPdfAsBase64(fileUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    console.log('fetching fileUri:', fileUri);
    const res = await fetch(fileUri);
    console.log('got blob response');
    const blob = await res.blob();
    console.log('reading as base64, blob size:', blob.size);
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('FileReader onloadend fired');
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = (e) => {
        console.log('FileReader error:', e);
        reject(e);
      };
      reader.readAsDataURL(blob);
    });
  }
  return await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64' as const,
  });
}

export async function generateFormatFromPdf(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');

  onStatus?.('Reading PDF...');
  const base64 = await readPdfAsBase64(fileUri);

  onStatus?.(`Generating ${format === 'mini' ? 'Essentials' : format === 'pro' ? 'Abridged' : 'Full'} pages...`);

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: FORMAT_PROMPTS[format] },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  onStatus?.('Parsing result...');

  const parsed = JSON.parse(text);
  if (!parsed.pages || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('Gemini returned no pages');
  }

  return {
    title: parsed.title || '',
    author: parsed.author || '',
    summary: parsed.summary || '',
    pages: parsed.pages.map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? i + 1,
      content: p.content || p.summary || '',
    })),
  };
}

export async function generateFormatFromPdfOpenRouter(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');

  onStatus?.('Reading PDF...');
  const base64 = await readPdfAsBase64(fileUri);

  const formatLabel = format === 'mini' ? 'Essentials' : format === 'pro' ? 'Abridged' : 'Full';
  onStatus?.(`Generating ${formatLabel} pages via OpenRouter...`);

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bookie.app',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: FORMAT_PROMPTS[format],
            },
            {
              type: 'image_url',
              image_url: { url: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} — ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenRouter');

  onStatus?.('Parsing result...');

  const parsed = JSON.parse(text);
  if (!parsed.pages || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('OpenRouter returned no pages');
  }

  return {
    title: parsed.title || '',
    author: parsed.author || '',
    summary: parsed.summary || '',
    pages: parsed.pages.map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? i + 1,
      content: p.content || p.summary || '',
    })),
  };
}
