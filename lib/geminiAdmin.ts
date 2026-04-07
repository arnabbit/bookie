import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { PDFDocument } from 'pdf-lib';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite';
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

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

// ---------- PDF helpers ----------

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getPageCount(base64: string): Promise<number> {
  const pdf = await PDFDocument.load(base64ToBytes(base64), { ignoreEncryption: true });
  return pdf.getPageCount();
}

/** Extract pages [startPage, endPage] (1-indexed inclusive) into a new PDF base64 */
async function extractPdfPages(base64: string, startPage: number, endPage: number): Promise<string> {
  const srcBytes = base64ToBytes(base64);
  const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  // pdf-lib uses 0-indexed pages
  const indices = [];
  for (let i = startPage - 1; i < endPage; i++) indices.push(i);

  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) newDoc.addPage(page);

  const newBytes = await newDoc.save();
  return bytesToBase64(newBytes);
}

// ---------- Prompt helpers ----------

function computeExpectedPages(format: FormatType, totalPages: number): number {
  if (format === 'mini') return Math.max(Math.round(totalPages * 0.1), 1);
  if (format === 'pro') return Math.max(Math.round(totalPages * 0.3), 1);
  return totalPages;
}

function formatLabel(format: FormatType): string {
  return format === 'mini' ? 'Essentials' : format === 'pro' ? 'Abridged' : 'Full';
}

const QUALITY_RULES_MINI = `- For each output page, condense that section into its core idea, turning point, or thesis. Skip supporting arguments, examples, anecdotes — keep only what's load-bearing.
- Write in the author's voice. Every page should feel like a perfectly chosen excerpt.
- Each page must flow naturally into the next, creating a coherent fast-paced read through the whole book.
- End each page on tension or an unresolved idea — make the reader need the next page.
- Never fabricate events or details not in the original text.`;

const QUALITY_RULES_PRO = `- Preserve the narrative flow — arguments should build, characters should develop, ideas should layer. Include key examples and pivotal moments.
- Write in the author's authentic voice and style — never flatten into generic prose.
- Be vivid and sensory. Open each page with something that grabs attention.
- End each page on a micro-cliffhanger or unresolved tension.
- Never fabricate events or details not in the original text.`;

const QUALITY_RULES_ULTRA = `- Narratively retell each page's content in the author's style. Preserve ALL content — every argument, example, character moment, subplot. Nothing is cut.
- Write in the author's authentic voice. Be vivid, sensory, emotionally resonant.
- Each page must be self-contained and readable on its own, yet leave the reader hungry for more.
- End each page on tension or an unresolved moment.
- Never fabricate events or details not in the original text.`;

function qualityRules(format: FormatType): string {
  if (format === 'mini') return QUALITY_RULES_MINI;
  if (format === 'pro') return QUALITY_RULES_PRO;
  return QUALITY_RULES_ULTRA;
}

/** Single-shot prompt for small outputs (<= BATCH_SIZE) — full PDF sent */
function buildPrompt(format: FormatType, totalPages: number): string {
  const expected = computeExpectedPages(format, totalPages);
  const pagesPerOutput = Math.round(totalPages / expected);

  return `You are a literary condensation engine. This PDF has ${totalPages} pages. You MUST produce EXACTLY ${expected} output pages.

CRITICAL — FULL COVERAGE: Divide all ${totalPages} pages evenly across your ${expected} output pages. Each output page covers roughly ${pagesPerOutput} consecutive original pages. Page 1 covers the beginning, page ${expected} covers the ending. The reader must experience the complete book from start to finish — no gaps, no skipped sections.

STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count carefully.

${qualityRules(format)}

Instructions:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce EXACTLY ${expected} output pages.

Respond with ONLY valid JSON:
{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": 1, "content": "string — EXACTLY 60-80 words" }
  ]
}`;
}

/** Batch prompt — receives a PDF chunk, not the full document */
function buildBatchPrompt(
  format: FormatType,
  batchIndex: number,
  totalBatches: number,
  startPage: number,
  endPage: number,
  pagesInBatch: number,
  totalOutputPages: number,
  pdfStart: number,
  pdfEnd: number,
  totalPdfPages: number,
): string {
  const isFirst = batchIndex === 0;

  const metaInstructions = isFirst
    ? `Instructions:
1. Extract the book's title and author.
2. Write a one-paragraph summary of the ENTIRE book (100-150 words) based on this excerpt and your knowledge of the full work.
3. Produce EXACTLY ${pagesInBatch} output pages numbered ${startPage} through ${endPage}.`
    : `Instructions:
Produce EXACTLY ${pagesInBatch} output pages numbered ${startPage} through ${endPage}. Do NOT include title, author, or summary — only pages.`;

  const jsonFormat = isFirst
    ? `{
  "title": "string",
  "author": "string",
  "summary": "string — 100-150 word book summary",
  "pages": [
    { "pageNumber": ${startPage}, "content": "string — EXACTLY 60-80 words" }
  ]
}`
    : `{
  "pages": [
    { "pageNumber": ${startPage}, "content": "string — EXACTLY 60-80 words" }
  ]
}`;

  return `You are a literary condensation engine. You are creating a ${totalOutputPages}-page condensed version of a ${totalPdfPages}-page book.

This PDF excerpt contains pages ${pdfStart}-${pdfEnd} of the original book (batch ${batchIndex + 1} of ${totalBatches}). Generate EXACTLY ${pagesInBatch} output pages that cover ALL content in this excerpt. Every page of this excerpt must be represented — read it completely from start to finish.

STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count carefully.

${qualityRules(format)}

${metaInstructions}

Respond with ONLY valid JSON:
${jsonFormat}`;
}

// ---------- Retry helper ----------

async function callWithRetry(fn: () => Promise<string>): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      console.warn(`Batch attempt ${attempt} failed, retrying in ${delay}ms...`, e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// ---------- Batch orchestration ----------

interface BatchCallFn {
  (base64: string, prompt: string): Promise<string>;
}

async function generateInBatches(
  base64: string,
  totalPdfPages: number,
  format: FormatType,
  callApi: BatchCallFn,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  const expectedPages = computeExpectedPages(format, totalPdfPages);

  // Small enough — single shot with full PDF
  if (expectedPages <= BATCH_SIZE) {
    const label = formatLabel(format);
    onStatus?.(`Generating ${expectedPages} ${label} pages...`);
    const prompt = buildPrompt(format, totalPdfPages);
    const raw = await callWithRetry(() => callApi(base64, prompt));
    const parsed = JSON.parse(raw);
    if (!parsed.pages?.length) throw new Error('No pages returned');

    return {
      title: parsed.title || '',
      author: parsed.author || '',
      summary: parsed.summary || '',
      pages: parsed.pages.slice(0, expectedPages).map((p: any, i: number) => ({
        pageNumber: p.pageNumber ?? i + 1,
        content: p.content || p.summary || '',
      })),
    };
  }

  // Batch mode — split PDF and send chunks
  const batches: { startPage: number; endPage: number; count: number; pdfStart: number; pdfEnd: number }[] = [];
  for (let i = 0; i < expectedPages; i += BATCH_SIZE) {
    const startPage = i + 1;
    const endPage = Math.min(i + BATCH_SIZE, expectedPages);
    const count = endPage - startPage + 1;
    const pdfStart = Math.floor((startPage - 1) / expectedPages * totalPdfPages) + 1;
    const pdfEnd = Math.min(Math.floor(endPage / expectedPages * totalPdfPages), totalPdfPages);
    batches.push({ startPage, endPage, count, pdfStart, pdfEnd });
  }

  let title = '';
  let author = '';
  let summary = '';
  const allPages: GeneratedPage[] = [];

  for (let b = 0; b < batches.length; b++) {
    const { startPage, endPage, count, pdfStart, pdfEnd } = batches[b];
    onStatus?.(`Batch ${b + 1}/${batches.length} — splitting PDF pages ${pdfStart}-${pdfEnd}...`);

    const chunkBase64 = await extractPdfPages(base64, pdfStart, pdfEnd);

    onStatus?.(`Batch ${b + 1}/${batches.length} — generating pages ${startPage}-${endPage}...`);

    const prompt = buildBatchPrompt(
      format, b, batches.length,
      startPage, endPage, count,
      expectedPages, pdfStart, pdfEnd, totalPdfPages,
    );

    const raw = await callWithRetry(() => callApi(chunkBase64, prompt));
    const parsed = JSON.parse(raw);

    if (b === 0) {
      title = parsed.title || '';
      author = parsed.author || '';
      summary = parsed.summary || '';
    }

    const pages: GeneratedPage[] = (parsed.pages || []).slice(0, count).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? startPage + i,
      content: p.content || p.summary || '',
    }));

    allPages.push(...pages);
  }

  return { title, author, summary, pages: allPages.slice(0, expectedPages) };
}

// ---------- Gemini direct API call ----------

function makeGeminiCall(apiKey: string): BatchCallFn {
  return async (base64: string, prompt: string): Promise<string> => {
    const body = {
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
            { text: prompt },
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
    return text;
  };
}

// ---------- OpenRouter API call ----------

function makeOpenRouterCall(apiKey: string, model: string): BatchCallFn {
  return async (base64: string, prompt: string): Promise<string> => {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bookie.app',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } },
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
    return text;
  };
}

// ---------- Public API ----------

export async function generateFormatFromPdf(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');

  onStatus?.('Reading PDF...');
  const base64 = await readPdfAsBase64(fileUri);

  onStatus?.('Counting pages...');
  const totalPages = await getPageCount(base64);
  if (totalPages === 0) throw new Error('Could not detect page count from PDF');

  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages detected → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(base64, totalPages, format, makeGeminiCall(apiKey), onStatus);
}

export async function generateFormatFromPdfOpenRouter(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');

  const useModel = model || OPENROUTER_MODEL;

  onStatus?.('Reading PDF...');
  const base64 = await readPdfAsBase64(fileUri);

  onStatus?.('Counting pages...');
  const totalPages = await getPageCount(base64);
  if (totalPages === 0) throw new Error('Could not detect page count from PDF');

  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages detected → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  return generateInBatches(base64, totalPages, format, makeOpenRouterCall(apiKey, useModel), onStatus);
}
