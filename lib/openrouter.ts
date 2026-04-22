import { Platform } from 'react-native';
import { GeminiBookResult } from './gemini';

const OCR_ENDPOINT = 'https://pdftotext-sof5.onrender.com/ocr';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// ---------- Types ----------

interface ParsedPage {
  pageNum: number;
  text: string;
}

interface BatchResult {
  pages: { page: number; summary: string }[];
}

export interface ProgressiveCallbacks {
  onStatus?: (msg: string) => void;
  onFirstBook?: (book: GeminiBookResult) => void;
  onBookUpdated?: (book: GeminiBookResult) => void;
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

// ---------- Batch pages ----------

function batchPages(pages: ParsedPage[]): ParsedPage[][] {
  const batches: ParsedPage[][] = [];
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    batches.push(pages.slice(i, i + BATCH_SIZE));
  }
  return batches;
}

// ---------- OpenRouter call ----------

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
      if (attempt === MAX_RETRIES) throw e;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      const errMsg = (e as Error)?.message || String(e);
      console.warn(`OpenRouter attempt ${attempt} failed, retrying in ${delay}ms...`, e);
      onStatus?.(`Retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s — ${errMsg.substring(0, 120)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// ---------- Per-batch page summaries + chapter detection ----------

async function processBatch(
  apiKey: string,
  model: string,
  batch: ParsedPage[],
  onStatus?: (msg: string) => void
): Promise<BatchResult> {
  const pagesText = batch
    .map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`)
    .join('\n\n');

  const prompt = `You are given pages from a book with "Page X start" / "Page X end" markers.

For each page, write a 50-70 word summary that rewrites the page content concisely while preserving the key points.

Respond with ONLY valid JSON:
{
  "pages": [
    { "page": number, "summary": "50-70 word rewrite" }
  ]
}

Here are the pages:

${pagesText}`;

  const raw = await callOpenRouter(apiKey, model, prompt, onStatus);
  try {
    return JSON.parse(raw) as BatchResult;
  } catch (e) {
    throw new Error(`Malformed JSON from OpenRouter batch: ${(e as Error).message} — preview: ${raw.substring(0, 200)}`);
  }
}

// ---------- Assemble book: all pages under one chapter ----------

function assemblePageByPageBook(
  allPageSummaries: { page: number; summary: string }[],
  title: string,
  done: boolean
): GeminiBookResult {
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
  };
}

// ---------- Main pipeline (progressive) ----------

export async function processWithOpenRouter(
  fileUri: string,
  apiKey: string,
  model: string,
  callbacks?: ProgressiveCallbacks
): Promise<GeminiBookResult> {
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

  // Step 2: Batch process pages
  const batches = batchPages(pages);
  const allPageSummaries: { page: number; summary: string }[] = [];
  let firstBookSent = false;

  for (let i = 0; i < batches.length; i++) {
    onStatus?.(`Summarizing pages ${i * BATCH_SIZE + 1}-${Math.min((i + 1) * BATCH_SIZE, pages.length)} of ${pages.length}...`);
    const result = await processBatch(apiKey, model, batches[i], onStatus);
    allPageSummaries.push(...result.pages);

    const book = assemblePageByPageBook(allPageSummaries, title, false);

    if (!firstBookSent) {
      onFirstBook?.(book);
      firstBookSent = true;
    } else {
      onBookUpdated?.(book);
    }
  }

  const finalBook = assemblePageByPageBook(allPageSummaries, title, true);
  onBookUpdated?.(finalBook);
  return finalBook;
}

