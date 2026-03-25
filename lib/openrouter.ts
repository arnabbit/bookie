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
          temperature: 0.3,
          stream: false,
          response_format: { type: 'json_object' },
        }),
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
    }
  }
}

// ---------- Single page summary with context ----------

async function summarizePage(
  apiKey: string,
  model: string,
  pages: ParsedPage[],
  index: number
): Promise<string> {
  const prev = index > 0 ? pages[index - 1] : null;
  const curr = pages[index];
  const next = index < pages.length - 1 ? pages[index + 1] : null;

  let context = '';
  if (prev) context += `--- Previous page (for context only, do NOT summarize) ---\n${prev.text}\n\n`;
  context += `--- CURRENT PAGE (summarize ONLY this) ---\n${curr.text}\n\n`;
  if (next) context += `--- Next page (for context only, do NOT summarize) ---\n${next.text}\n\n`;

  const prompt = `You are summarizing a book page by page. Below you are given the CURRENT PAGE along with the previous and next pages for context.

Write a 50-70 word summary of ONLY the CURRENT PAGE. Do NOT include information from the previous or next pages. Only describe what is explicitly written on the current page.

${context}

Respond with ONLY valid JSON:
{ "summary": "50-70 word summary of the current page only" }`;

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
    const summary = await summarizePage(apiKey, model, pages, i);
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

