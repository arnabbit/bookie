import { ocrPdf } from './openrouter';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-preview';
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;

// Module-level handle so the UI can manually abort the in-flight batch request.
let currentInflightController: AbortController | null = null;
// Module-level handle to wake an in-progress backoff sleep between retries.
let skipBackoffResolve: (() => void) | null = null;

export function cancelCurrentBatchRequest(): boolean {
  let acted = false;
  if (currentInflightController) {
    console.warn('[geminiAdmin] manual retry — aborting current request');
    try { currentInflightController.abort(); } catch {}
    acted = true;
  }
  if (skipBackoffResolve) {
    console.warn('[geminiAdmin] manual retry — skipping backoff sleep');
    try { skipBackoffResolve(); } catch {}
    skipBackoffResolve = null;
    acted = true;
  }
  return acted;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  currentInflightController = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { controller.abort(); } catch {}
      console.warn(`[fetchWithTimeout] aborting after ${timeoutMs}ms: ${url}`);
      reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — retrying`));
    }, timeoutMs);
  });
  try {
    const fetchPromise = fetch(url, { ...init, signal: controller.signal }).catch((e: any) => {
      if (e?.name === 'AbortError') {
        throw new Error(`Request aborted — retrying`);
      }
      throw e;
    });
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (currentInflightController === controller) currentInflightController = null;
  }
}

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

// ---------- OCR page parser ----------

interface OcrPage {
  pageNum: number;
  text: string;
}

function parseOcrPages(ocrText: string): OcrPage[] {
  const pages: OcrPage[] = [];
  const regex = /Page\s+(\d+)\s+start([\s\S]*?)Page\s+\1\s+end/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(ocrText)) !== null) {
    pages.push({ pageNum: parseInt(match[1], 10), text: match[2].trim() });
  }
  return pages;
}

// ---------- Helpers ----------

function computeExpectedPages(format: FormatType, totalPages: number): number {
  if (format === 'mini') return Math.max(Math.round(totalPages * 0.1), 1);
  if (format === 'pro') return Math.max(Math.round(totalPages * 0.3), 1);
  return totalPages;
}

function formatLabel(format: FormatType): string {
  return format === 'mini' ? 'Essentials' : format === 'pro' ? 'Abridged' : 'Full';
}

// ---------- Quality rules ----------

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

// ---------- Prompt builders ----------

function buildPrompt(format: FormatType, totalPages: number, bookText: string): string {
  const expected = computeExpectedPages(format, totalPages);
  const pagesPerOutput = Math.round(totalPages / expected);

  return `You are a literary condensation engine. The following book has ${totalPages} pages. You MUST produce EXACTLY ${expected} output pages.

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
}

--- BOOK TEXT ---
${bookText}`;
}

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
  batchText: string,
): string {
  const isFirst = batchIndex === 0;

  const metaInstructions = isFirst
    ? `Instructions:
1. Extract the book's title and author.
2. Write a one-paragraph summary of the ENTIRE book (100-150 words).
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

This text excerpt contains pages ${pdfStart}-${pdfEnd} of the original book (batch ${batchIndex + 1} of ${totalBatches}). Generate EXACTLY ${pagesInBatch} output pages that cover ALL content in this excerpt. Every page must be represented — read it completely from start to finish.

STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count carefully.

${qualityRules(format)}

${metaInstructions}

Respond with ONLY valid JSON:
${jsonFormat}

--- BOOK TEXT (pages ${pdfStart}-${pdfEnd}) ---
${batchText}`;
}

// ---------- Validator + single-page regen ----------

interface PageSlice {
  pageNumber: number;
  sliceStart: number;
  sliceEnd: number;
  sliceText: string;
}

interface FlaggedPage {
  pageNumber: number;
  issue: string;
}

function buildValidatorPrompt(pages: GeneratedPage[], slices: PageSlice[]): string {
  const items = pages
    .map((p) => {
      const s = slices.find((x) => x.pageNumber === p.pageNumber);
      if (!s) return '';
      return `--- Output page ${p.pageNumber} (source: PDF pages ${s.sliceStart}-${s.sliceEnd}) ---
SOURCE:
${s.sliceText}

GENERATED:
${p.content}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `You are a faithfulness validator. For each generated page, check it against its source PDF pages.

Flag a page as INVALID only if:
- It introduces events, characters, places, or factual details NOT present in the source.
- It summarizes content from a clearly different section of the book (source/generated mismatch).
- It drastically misrepresents the source's meaning.

Do NOT flag for:
- Stylistic rephrasing or condensation (expected).
- Selective emphasis on key ideas.
- Word count deviations.

Be conservative — only flag clear morphing or fabrication.

Respond with ONLY valid JSON:
{ "flagged": [{ "pageNumber": <number>, "issue": "<short description>" }] }

If nothing is wrong, return { "flagged": [] }.

${items}`;
}

function buildRegenPrompt(format: FormatType, slice: PageSlice, issue: string): string {
  return `You are regenerating a single page that failed a faithfulness check.

ISSUE REPORTED: ${issue}

Regenerate the page strictly from the source below. Do not introduce anything not in the source.

STRICT WORD COUNT: exactly 60-80 words.

${qualityRules(format)}

Respond with ONLY valid JSON:
{ "content": "string — EXACTLY 60-80 words" }

--- SOURCE (PDF pages ${slice.sliceStart}-${slice.sliceEnd}) ---
${slice.sliceText}`;
}

function computePageSlices(
  ocrPages: OcrPage[],
  pages: GeneratedPage[],
  pdfStart: number,
  pdfEnd: number,
): PageSlice[] {
  const count = pages.length;
  if (count === 0) return [];
  const perPage = (pdfEnd - pdfStart + 1) / count;
  return pages.map((p, i) => {
    const sliceStart = pdfStart + Math.floor(i * perPage);
    const sliceEnd = Math.max(sliceStart, pdfStart + Math.floor((i + 1) * perPage) - 1);
    const slicePages = ocrPages.filter((op) => op.pageNum >= sliceStart && op.pageNum <= sliceEnd);
    const sliceText = slicePages
      .map((op) => `Page ${op.pageNum} start\n${op.text}\nPage ${op.pageNum} end`)
      .join('\n\n');
    return { pageNumber: p.pageNumber, sliceStart, sliceEnd, sliceText };
  });
}

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

const WORD_COUNT_MAX = 100;
const VALIDATOR_TEMP = 0.2;

async function validateAndRepair(
  callApi: TextCallFn,
  format: FormatType,
  pages: GeneratedPage[],
  slices: PageSlice[],
  onStatus?: (msg: string) => void,
): Promise<GeneratedPage[]> {
  const flaggedMap = new Map<number, string>();

  // Deterministic: flag any page that exceeds word-count tolerance.
  for (const p of pages) {
    const wc = countWords(p.content);
    if (wc > WORD_COUNT_MAX) {
      flaggedMap.set(p.pageNumber, `word count too high: ${wc} words (cap ${WORD_COUNT_MAX})`);
    }
  }

  // LLM judge for faithfulness.
  try {
    const parsed = await callWithRetry(() =>
      callAndParse(callApi, buildValidatorPrompt(pages, slices), { temperature: VALIDATOR_TEMP }),
    );
    const llmFlags: FlaggedPage[] = Array.isArray(parsed?.flagged)
      ? parsed.flagged.filter((f: any) => typeof f?.pageNumber === 'number')
      : [];
    for (const f of llmFlags) {
      if (!flaggedMap.has(f.pageNumber)) {
        flaggedMap.set(f.pageNumber, f.issue || 'morphed content');
      }
    }
  } catch (e) {
    console.warn('Validator pass failed, using word-count flags only', e);
  }

  if (flaggedMap.size === 0) return pages;

  const result = [...pages];
  for (const [pageNumber, issue] of flaggedMap) {
    const slice = slices.find((s) => s.pageNumber === pageNumber);
    const idx = result.findIndex((p) => p.pageNumber === pageNumber);
    if (!slice || idx < 0) continue;
    onStatus?.(`Repairing page ${pageNumber} — ${issue.substring(0, 60)}`);
    try {
      const parsed = await callWithRetry(() =>
        callAndParse(callApi, buildRegenPrompt(format, slice, issue), { temperature: VALIDATOR_TEMP }),
      );
      const content = parsed?.content;
      if (typeof content === 'string' && content.trim()) {
        result[idx] = { ...result[idx], content };
      }
    } catch (e) {
      console.warn(`Regen failed for page ${pageNumber}, keeping original`, e);
    }
  }
  return result;
}

// ---------- Retry helper ----------

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      console.warn(`Batch attempt ${attempt} failed, retrying in ${delay}ms...`, e);
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const resolver = () => {
          if (timer) clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          if (skipBackoffResolve === resolver) skipBackoffResolve = null;
          resolve();
        }, delay);
        skipBackoffResolve = resolver;
      });
    }
  }
  throw new Error('Unreachable');
}

async function callAndParse(callApi: TextCallFn, prompt: string, opts?: TextCallOpts): Promise<any> {
  const raw = await callApi(prompt, opts);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Malformed JSON response: ${(e as Error).message} — preview: ${raw.substring(0, 200)}`);
  }
}

// ---------- Batch orchestration ----------

interface TextCallOpts {
  temperature?: number;
}

interface TextCallFn {
  (prompt: string, opts?: TextCallOpts): Promise<string>;
}

async function generateInBatches(
  ocrPages: OcrPage[],
  format: FormatType,
  callApi: TextCallFn,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  const totalPdfPages = ocrPages.length;
  const expectedPages = computeExpectedPages(format, totalPdfPages);

  // Small enough — single shot
  if (expectedPages <= BATCH_SIZE) {
    const label = formatLabel(format);
    onStatus?.(`Generating ${expectedPages} ${label} pages...`);
    const bookText = ocrPages.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
    const prompt = buildPrompt(format, totalPdfPages, bookText);
    const parsed = await callWithRetry(() => callAndParse(callApi, prompt));
    if (!parsed.pages?.length) throw new Error('No pages returned');

    let pages: GeneratedPage[] = parsed.pages.slice(0, expectedPages).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? i + 1,
      content: p.content || p.summary || '',
    }));

    onStatus?.('Validating pages against source...');
    const slices = computePageSlices(ocrPages, pages, 1, totalPdfPages);
    pages = await validateAndRepair(callApi, format, pages, slices, onStatus);

    return {
      title: parsed.title || '',
      author: parsed.author || '',
      summary: parsed.summary || '',
      pages,
    };
  }

  // Batch mode — split OCR text into chunks
  const batches: { startPage: number; endPage: number; count: number; pdfStart: number; pdfEnd: number; text: string }[] = [];
  for (let i = 0; i < expectedPages; i += BATCH_SIZE) {
    const startPage = i + 1;
    const endPage = Math.min(i + BATCH_SIZE, expectedPages);
    const count = endPage - startPage + 1;
    const pdfStart = Math.floor((startPage - 1) / expectedPages * totalPdfPages) + 1;
    const pdfEnd = Math.min(Math.floor(endPage / expectedPages * totalPdfPages), totalPdfPages);

    const chunkPages = ocrPages.filter((p) => p.pageNum >= pdfStart && p.pageNum <= pdfEnd);
    const text = chunkPages.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
    batches.push({ startPage, endPage, count, pdfStart, pdfEnd, text });
  }

  let title = '';
  let author = '';
  let summary = '';
  const allPages: GeneratedPage[] = [];

  for (let b = 0; b < batches.length; b++) {
    const { startPage, endPage, count, pdfStart, pdfEnd, text } = batches[b];
    onStatus?.(`Batch ${b + 1}/${batches.length} — generating pages ${startPage}-${endPage} (PDF pages ${pdfStart}-${pdfEnd})...`);

    const prompt = buildBatchPrompt(
      format, b, batches.length,
      startPage, endPage, count,
      expectedPages, pdfStart, pdfEnd, totalPdfPages,
      text,
    );

    const parsed = await callWithRetry(() => callAndParse(callApi, prompt));

    if (b === 0) {
      title = parsed.title || '';
      author = parsed.author || '';
      summary = parsed.summary || '';
    }

    let pages: GeneratedPage[] = (parsed.pages || []).slice(0, count).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? startPage + i,
      content: p.content || p.summary || '',
    }));

    onStatus?.(`Validating batch ${b + 1}/${batches.length}...`);
    const slices = computePageSlices(ocrPages, pages, pdfStart, pdfEnd);
    pages = await validateAndRepair(callApi, format, pages, slices, onStatus);

    allPages.push(...pages);
  }

  return { title, author, summary, pages: allPages.slice(0, expectedPages) };
}

// ---------- API call factories ----------

function makeGeminiCall(apiKey: string): TextCallFn {
  return async (prompt: string, opts?: TextCallOpts): Promise<string> => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: opts?.temperature ?? 0.7,
      },
    };

    const res = await fetchWithTimeout(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
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

function makeOpenRouterCall(apiKey: string, model: string): TextCallFn {
  return async (prompt: string, opts?: TextCallOpts): Promise<string> => {
    const res = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bookie.app',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts?.temperature ?? 0.7,
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

  onStatus?.('Extracting text from PDF...');
  const ocrText = await ocrPdf(fileUri);
  const ocrPages = parseOcrPages(ocrText);
  if (ocrPages.length === 0) throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');

  const totalPages = ocrPages.length;
  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages extracted → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), onStatus);
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

  onStatus?.('Extracting text from PDF...');
  const ocrText = await ocrPdf(fileUri);
  const ocrPages = parseOcrPages(ocrText);
  if (ocrPages.length === 0) throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');

  const totalPages = ocrPages.length;
  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages extracted → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), onStatus);
}

// Generate mini/pro from an existing Full (ultra) version — skips OCR.
function fullPagesToOcr(fullPages: { pageNumber: number; content: string }[]): OcrPage[] {
  return fullPages.map((p) => ({ pageNum: p.pageNumber, text: p.content }));
}

export async function generateFormatFromFull(
  fullPages: { pageNumber: number; content: string }[],
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), onStatus);
}

export async function generateFormatFromFullOpenRouter(
  fullPages: { pageNumber: number; content: string }[],
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const useModel = model || OPENROUTER_MODEL;
  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), onStatus);
}
