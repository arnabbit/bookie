import { Platform } from 'react-native';
import { GeminiBookResult } from './gemini';

const OCR_ENDPOINT = 'https://pdftotext-sof5.onrender.com/ocr';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const BATCH_SIZE = 10;

// ---------- Types ----------

interface ParsedPage {
  pageNum: number;
  text: string;
}

interface BatchResult {
  pages: { page: number; summary: string }[];
  chapters: { title: string; startPage: number; endPage: number }[];
}

interface ChapterSummaryResult {
  title: string;
  author: string;
  quote: string;
  tags: string[];
  chapters: {
    title: string;
    summary: string;
  }[];
}

export interface ProgressiveCallbacks {
  onStatus?: (msg: string) => void;
  onFirstBook?: (book: GeminiBookResult) => void;
  onBookUpdated?: (book: GeminiBookResult) => void;
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
  prompt: string
): Promise<string> {
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
}

// ---------- Per-batch page summaries + chapter detection ----------

async function processBatch(
  apiKey: string,
  model: string,
  batch: ParsedPage[]
): Promise<BatchResult> {
  const pagesText = batch
    .map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`)
    .join('\n\n');

  const prompt = `You are given pages from a book with "Page X start" / "Page X end" markers.

For each page, write a 30-50 word summary that rewrites the page content concisely while preserving the key points.

Also identify where chapters start and end based on the content (look for chapter headings, major topic shifts, or explicit chapter markers).

Respond with ONLY valid JSON:
{
  "pages": [
    { "page": number, "summary": "30-50 word rewrite" }
  ],
  "chapters": [
    { "title": "chapter title", "startPage": number, "endPage": number }
  ]
}

Here are the pages:

${pagesText}`;

  const raw = await callOpenRouter(apiKey, model, prompt);
  return JSON.parse(raw) as BatchResult;
}

// ---------- Chapter-level summary from all page summaries ----------

async function generateChapterSummaries(
  apiKey: string,
  model: string,
  allPageSummaries: string,
  chapterBoundaries: { title: string; startPage: number; endPage: number }[]
): Promise<ChapterSummaryResult> {
  const chaptersDesc = chapterBoundaries
    .map((c) => `"${c.title}": pages ${c.startPage}-${c.endPage}`)
    .join('\n');

  const prompt = `You are given page-by-page summaries of an entire book, plus detected chapter boundaries.

Using the page summaries below, produce:
1. The book's title and author (infer from content)
2. A memorable quote (infer the most impactful line)
3. 2-4 genre/theme tags
4. For each chapter: a narrative summary of 80-100 words in the author's style

Chapter boundaries:
${chaptersDesc}

Page summaries:
${allPageSummaries}

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "quote": "string",
  "tags": ["string"],
  "chapters": [
    { "title": "string", "summary": "80-100 word narrative summary" }
  ]
}`;

  const raw = await callOpenRouter(apiKey, model, prompt);
  return JSON.parse(raw) as ChapterSummaryResult;
}

// ---------- Assemble partial book from what we have so far ----------

function assemblePartialBook(
  allPageSummaries: { page: number; summary: string }[],
  chapterBoundaries: { title: string; startPage: number; endPage: number }[]
): GeminiBookResult {
  const merged = mergeChapterBoundaries(chapterBoundaries);

  // If no chapters detected yet, put all pages under one chapter
  if (merged.length === 0) {
    return {
      title: 'Processing...',
      author: '',
      quote: '',
      tags: [],
      chapters: [
        {
          title: 'Chapter 1',
          summary: 'Processing...',
          pages: allPageSummaries.map((p) => ({ summary: p.summary })),
        },
      ],
    };
  }

  const chapters = merged.map((boundary) => {
    const chapterPages = allPageSummaries.filter(
      (p) => p.page >= boundary.startPage && p.page <= boundary.endPage
    );
    return {
      title: boundary.title,
      summary: 'Processing...',
      pages: chapterPages.length > 0
        ? chapterPages.map((p) => ({ summary: p.summary }))
        : [{ summary: 'Processing...' }],
    };
  });

  return {
    title: 'Processing...',
    author: '',
    quote: '',
    tags: [],
    chapters,
  };
}

// ---------- Main pipeline (progressive) ----------

export async function processWithOpenRouter(
  fileUri: string,
  apiKey: string,
  model: string,
  callbacks?: ProgressiveCallbacks
): Promise<GeminiBookResult> {
  const { onStatus, onFirstBook, onBookUpdated } = callbacks || {};

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
  const allChapterBoundaries: { title: string; startPage: number; endPage: number }[] = [];
  let firstBookSent = false;

  for (let i = 0; i < batches.length; i++) {
    onStatus?.(`Summarizing pages ${i * BATCH_SIZE + 1}-${Math.min((i + 1) * BATCH_SIZE, pages.length)} of ${pages.length}...`);
    const result = await processBatch(apiKey, model, batches[i]);
    allPageSummaries.push(...result.pages);
    allChapterBoundaries.push(...result.chapters);

    // After first batch: send partial book so user can start reading
    if (!firstBookSent) {
      const partial = assemblePartialBook(allPageSummaries, allChapterBoundaries);
      onFirstBook?.(partial);
      firstBookSent = true;
    } else {
      // Update book with new pages
      const updated = assemblePartialBook(allPageSummaries, allChapterBoundaries);
      onBookUpdated?.(updated);
    }
  }

  // Step 3: Generate chapter summaries
  onStatus?.('Generating chapter summaries...');
  const mergedChapters = mergeChapterBoundaries(allChapterBoundaries);
  const summaryText = allPageSummaries
    .map((p) => `Page ${p.page}: ${p.summary}`)
    .join('\n');

  const bookResult = await generateChapterSummaries(
    apiKey,
    model,
    summaryText,
    mergedChapters
  );

  // Step 4: Final assembly
  const chapters = bookResult.chapters.map((ch, idx) => {
    const boundary = mergedChapters[idx];
    const chapterPages = boundary
      ? allPageSummaries.filter(
          (p) => p.page >= boundary.startPage && p.page <= boundary.endPage
        )
      : [];

    return {
      title: ch.title,
      summary: ch.summary,
      pages: chapterPages.length > 0
        ? chapterPages.map((p) => ({ summary: p.summary }))
        : [{ summary: ch.summary }],
    };
  });

  const finalBook: GeminiBookResult = {
    title: bookResult.title,
    author: bookResult.author,
    quote: bookResult.quote,
    tags: bookResult.tags,
    chapters,
  };

  onBookUpdated?.(finalBook);
  return finalBook;
}

// ---------- Helpers ----------

function mergeChapterBoundaries(
  boundaries: { title: string; startPage: number; endPage: number }[]
): { title: string; startPage: number; endPage: number }[] {
  if (boundaries.length === 0) return [];

  const sorted = [...boundaries].sort((a, b) => a.startPage - b.startPage);
  const merged: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    if (
      curr.title.toLowerCase() === prev.title.toLowerCase() ||
      curr.startPage <= prev.endPage + 1
    ) {
      prev.endPage = Math.max(prev.endPage, curr.endPage);
      if (curr.title.length > prev.title.length) prev.title = curr.title;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
