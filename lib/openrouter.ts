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

// ---------- Pass 1: Translate (per page, no context) ----------

async function translatePage(
  apiKey: string,
  model: string,
  page: ParsedPage
): Promise<string> {
  const prompt = `Condense the following text into 50-70 words. Use only what is written — no invented details, no inferences. Write in vivid narrative prose, not as a summary. Never say "this page", "the text", or "the author".

Text:
${page.text}

Respond with ONLY valid JSON:
{ "summary": "50-70 word condensed narrative" }`;

  const raw = await callOpenRouter(apiKey, model, prompt);
  const result = JSON.parse(raw) as PageSummaryResult;
  return result.summary;
}

// ---------- Pass 2: Editor (batched, smooths flow) ----------

const EDITOR_BATCH_SIZE = 30;

async function editSummaries(
  apiKey: string,
  model: string,
  summaries: { page: number; summary: string }[]
): Promise<{ page: number; summary: string }[]> {
  const edited: { page: number; summary: string }[] = [];

  for (let i = 0; i < summaries.length; i += EDITOR_BATCH_SIZE) {
    const batch = summaries.slice(i, i + EDITOR_BATCH_SIZE);
    const input = batch.map((s) => `Page ${s.page}: ${s.summary}`).join('\n\n');

    const prompt = `You are a literary editor. Below are condensed page-by-page summaries of a book. They are accurate but read choppily because each was written in isolation.

Rewrite each summary so they flow as a continuous narrative. For each page:
- Keep it 50-70 words
- Remove any repetition between consecutive pages
- Smooth transitions so one page leads naturally into the next
- Maintain the author's voice and style
- Do NOT add new information — only reshape what's there
- Keep them as separate entries, one per page

Summaries:
${input}

Respond with ONLY valid JSON:
{ "pages": [ { "page": number, "summary": "edited 50-70 word narrative" } ] }`;

    const raw = await callOpenRouter(apiKey, model, prompt);
    const result = JSON.parse(raw) as { pages: { page: number; summary: string }[] };
    edited.push(...result.pages);
  }

  return edited;
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

  // Step 2: Pass 1 — translate each page (no context, accurate)
  const rawSummaries: { page: number; summary: string }[] = [];
  let firstBookSent = false;

  for (let i = 0; i < pages.length; i++) {
    onStatus?.(`Condensing page ${i + 1} of ${pages.length}...`);
    const summary = await translatePage(apiKey, model, pages[i]);
    rawSummaries.push({ page: pages[i].pageNum, summary });

    const book = assemblePageByPageBook(rawSummaries, pages, title, false);

    if (!firstBookSent) {
      onFirstBook?.(book);
      firstBookSent = true;
    } else if (i % 3 === 0) {
      onBookUpdated?.(book);
    }
  }

  // Ensure all raw summaries are saved before editing
  onBookUpdated?.(assemblePageByPageBook(rawSummaries, pages, title, false));

  // Step 3: Pass 2 — editor smooths flow across all summaries
  onStatus?.('Polishing narrative flow...');
  const editedSummaries = await editSummaries(apiKey, model, rawSummaries);

  const finalBook = assemblePageByPageBook(editedSummaries, pages, title, true);
  onBookUpdated?.(finalBook);
  return finalBook;
}

