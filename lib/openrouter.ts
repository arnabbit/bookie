import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { GeminiBookResult } from './gemini';

const OCR_ENDPOINT = 'https://pdftotext-sof5.onrender.com/ocr';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

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

// ---------- Batch pages into groups of 50 ----------

function batchPages(pages: ParsedPage[], batchSize = 50): ParsedPage[][] {
  const batches: ParsedPage[][] = [];
  for (let i = 0; i < pages.length; i += batchSize) {
    batches.push(pages.slice(i, i + batchSize));
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

// ---------- Step 1: Per-batch page summaries + chapter detection ----------

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

// ---------- Step 2: Chapter-level summary from all page summaries ----------

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

// ---------- Main pipeline ----------

export async function processWithOpenRouter(
  fileUri: string,
  apiKey: string,
  model: string,
  onStatus?: (msg: string) => void
): Promise<GeminiBookResult> {
  // Step 1: OCR
  onStatus?.('Extracting text from PDF...');
  const ocrText = await ocrPdf(fileUri);
  const pages = parseOcrPages(ocrText);

  if (pages.length === 0) {
    throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');
  }

  onStatus?.(`Found ${pages.length} pages. Processing summaries...`);

  // Step 2: Batch process pages (50 at a time)
  const batches = batchPages(pages, 50);
  const allPageSummaries: { page: number; summary: string }[] = [];
  const allChapterBoundaries: { title: string; startPage: number; endPage: number }[] = [];

  for (let i = 0; i < batches.length; i++) {
    onStatus?.(`Processing batch ${i + 1}/${batches.length}...`);
    const result = await processBatch(apiKey, model, batches[i]);
    allPageSummaries.push(...result.pages);
    allChapterBoundaries.push(...result.chapters);
  }

  // Merge overlapping chapter boundaries from adjacent batches
  const mergedChapters = mergeChapterBoundaries(allChapterBoundaries);

  // Step 3: Generate chapter summaries from all page summaries
  onStatus?.('Generating chapter summaries...');
  const summaryText = allPageSummaries
    .map((p) => `Page ${p.page}: ${p.summary}`)
    .join('\n');

  const bookResult = await generateChapterSummaries(
    apiKey,
    model,
    summaryText,
    mergedChapters
  );

  // Step 4: Assemble into GeminiBookResult format
  onStatus?.('Assembling book...');
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

  return {
    title: bookResult.title,
    author: bookResult.author,
    quote: bookResult.quote,
    tags: bookResult.tags,
    chapters,
  };
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

    // If same title or overlapping, merge
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
