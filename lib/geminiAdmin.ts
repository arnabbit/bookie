import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  mini: `You are a master literary condensation engine. Your task is to distill an entire book into its absolute essence — the ~10% of content that carries 90% of the meaning.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce EXACTLY enough pages to represent ~10% of the book's total page count. For a 200-page book, that's ~20 pages. For a 50-page book, ~5 pages.
4. Each page: 30-50 words. Capture ONLY the core idea, turning point, or thesis of that section. Skip supporting arguments, examples, anecdotes — keep only what's load-bearing.
5. Write in the author's voice. Every page should feel like a perfectly chosen excerpt.
6. Each page must stand alone as a complete thought, yet flow naturally into the next.
7. End each page on tension or an unresolved idea — make the reader need the next page.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — 30-50 words" }
  ]
}`,

  pro: `You are a literary abridgment specialist. Your task is to create a substantial but focused retelling — ~30% of the original length. Enough to follow the full narrative arc while cutting redundancy.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce EXACTLY enough pages to represent ~30% of the book's total page count. For a 200-page book, that's ~60 pages. For a 50-page book, ~15 pages.
4. Each page: 40-70 words. Preserve the narrative flow — arguments should build, characters should develop, ideas should layer.
5. Include key examples, pivotal moments, and supporting reasoning that the Essentials version would skip.
6. Write in the author's authentic voice and style — never flatten into generic prose.
7. Be vivid and sensory. Open each page with something that grabs attention.
8. End each page on a micro-cliffhanger or unresolved tension.
9. Never fabricate events or details not in the original text.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — 40-70 words" }
  ]
}`,

  ultra: `You are a literary rewriter who channels any author's voice. Your task is to rewrite EVERY page of this book in a condensed but complete form — nothing is left out.

Analyze this PDF book and produce a JSON response with:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce ONE output page for EVERY page in the original PDF. If the book has 200 pages, produce 200 output pages.
4. Each page: 30-50 words. Narratively retell that page's content in the author's style.
5. Preserve ALL content — every argument, example, character moment, subplot. Nothing is cut.
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
    { "pageNumber": 1, "content": "string — 30-50 words" }
  ]
}`,
};

async function readPdfAsBase64(fileUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(fileUri);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
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
