import { Platform } from 'react-native';
import { GeminiBookResult } from './gemini';

const OCR_ENDPOINT = 'https://pdftotext-sof5.onrender.com/ocr';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// ---------- Types ----------

interface ParsedPage {
  pageNum: number;
  text: string;
}

interface PageSummaryResult {
  summary: string;
}

export interface OpenRouterBookResult extends GeminiBookResult {
  ocrPages?: { pageNum: number; text: string }[];
}

export interface ProgressiveCallbacks {
  onStatus?: (msg: string) => void;
  onFirstBook?: (book: OpenRouterBookResult) => void;
  onBookUpdated?: (book: OpenRouterBookResult) => void;
  bookTitle?: string;
}

// ---------- OCR ----------

export async function ocrPdf(fileUri: string): Promise<string> {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const res = await fetch(fileUri);
    const blob = await res.blob();
    formData.append('file', blob, 'book.pdf');
  } else {
    formData.append('file', {
      uri: fileUri,
      name: 'book.pdf',
      type: 'application/pdf',
    } as any);
  }

  const response = await fetch(OCR_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR failed (${response.status}): ${await response.text()}`);
  }

  return response.text();
}

// ---------- Parse OCR output ----------

function parseOcrPages(ocrText: string): ParsedPage[] {
  const pages: ParsedPage[] = [];
  const regex = /Page\s+(\d+)\s+start([\s\S]*?)Page\s+\1\s+end/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(ocrText)) !== null) {
    pages.push({ pageNum: parseInt(match[1], 10), text: match[2].trim() });
  }

  return pages;
}


// ---------- OpenRouter call ----------

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  let attempt = 0;

  while (true) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://bookie.app',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');
      return content;
    } catch (e) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`OpenRouter attempt ${attempt} failed, retrying in ${delay}ms...`, e);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------- Single page summary with context ----------

function lastWords(text: string, n: number): string {
  return text.split(/\s+/).slice(-n).join(' ');
}

async function summarizePage(
  apiKey: string,
  model: string,
  pages: ParsedPage[],
  index: number,
  prevSummary: string | null
): Promise<string> {
  const curr = pages[index];
  const next = index < pages.length - 1 ? pages[index + 1] : null;

  // Current page text goes FIRST — this is what the model should focus on
  let context = `=== TEXT TO SUMMARIZE ===\n${curr.text}\n\n`;
  if (next) context += `=== NEXT PAGE (for context only, do NOT summarize) ===\n${next.text}\n\n`;

  // Only pass a brief continuity hint, not the full previous summary
  const continuity = prevSummary
    ? `\nThe narrative so far ended with: "...${lastWords(prevSummary, 12)}"\nPick up from there. Do NOT repeat any of that.`
    : '\nThis is the first page. Set the scene.';

  const prompt = `Retell the TEXT TO SUMMARIZE below in 50-70 words of vivid, engaging narrative prose.
${continuity}

Rules:
- Your summary must contain ONLY NEW information from the text above
- Do NOT repeat, rephrase, or re-introduce anything already covered
- Write as the storyteller — never say "this page", "the text", "the author"
- Stay faithful to what is written — no invented details

${context}
Respond with ONLY valid JSON:
{ "summary": "50-70 word narrative" }`;

  const raw = await callOpenRouter(apiKey, model, prompt);
  const result = JSON.parse(raw) as PageSummaryResult;
  return result.summary;
}

// ---------- Assemble book: all pages under one chapter ----------

function assemblePageByPageBook(
  allPageSummaries: { page: number; summary: string }[],
  ocrPages: ParsedPage[],
  title: string,
  done: boolean
): OpenRouterBookResult {
  return {
    title: done ? title : `${title} (processing...)`,
    author: '',
    quote: '',
    tags: [],
    chapters: [
      {
        title: 'Full Book',
        summary: '',
        pages: allPageSummaries.map((p) => ({ summary: p.summary })),
      },
    ],
    ocrPages: ocrPages.map((p) => ({ pageNum: p.pageNum, text: p.text })),
  };
}

// ---------- Main pipeline (progressive) ----------

export async function processWithOpenRouter(
  fileUri: string,
  apiKey: string,
  model: string,
  callbacks?: ProgressiveCallbacks
): Promise<OpenRouterBookResult> {
  const { onStatus, onFirstBook, onBookUpdated, bookTitle } = callbacks || {};
  const title = bookTitle || 'Untitled';

  // Step 1: OCR
  onStatus?.('Extracting text from PDF...');
  const ocrText = await ocrPdf(fileUri);
  const pages = parseOcrPages(ocrText);

  if (pages.length === 0) {
    throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');
  }

  onStatus?.(`Found ${pages.length} pages. Processing...`);

  // Step 2: Process one page at a time with prev/next context
  const allPageSummaries: { page: number; summary: string }[] = [];
  let firstBookSent = false;

  for (let i = 0; i < pages.length; i++) {
    onStatus?.(`Summarizing page ${i + 1} of ${pages.length}...`);
    const prevSummary = allPageSummaries.length > 0
      ? allPageSummaries[allPageSummaries.length - 1].summary
      : null;
    const summary = await summarizePage(apiKey, model, pages, i, prevSummary);
    allPageSummaries.push({ page: pages[i].pageNum, summary });

    const book = assemblePageByPageBook(allPageSummaries, pages, title, false);

    if (!firstBookSent) {
      onFirstBook?.(book);
      firstBookSent = true;
    } else if (i % 3 === 0) {
      // Update every 3 pages to avoid excessive storage writes
      onBookUpdated?.(book);
    }
  }

  const finalBook = assemblePageByPageBook(allPageSummaries, pages, title, true);
  onBookUpdated?.(finalBook);
  return finalBook;
}

