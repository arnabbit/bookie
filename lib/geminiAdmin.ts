import { ocrPdf } from './openrouter';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-preview';
const BATCH_SIZE = 20;
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
      reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  try {
    const fetchPromise = fetch(url, { ...init, signal: controller.signal }).catch((e: any) => {
      if (e?.name === 'AbortError') {
        throw new Error(`Request aborted`);
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

export interface StrategyFlags {
  semanticChunking?: boolean;
  voiceCard?: boolean;
  perPageSmoothing?: boolean;
  backCheck?: boolean;
  highlightMap?: boolean;
}

type FormatType = 'mini' | 'pro' | 'ultra';

// Tuning — chosen defaults per admin-plans.md open Q's.
const SMOOTHING_CHUNK_SIZE = 5;
const BACK_CHECK_DELTA_THRESHOLD = 0.5; // judge score below this triggers regen
const BACK_CHECK_MAX_REGENS = 1; // regen each flagged page at most once

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

function buildPrompt(format: FormatType, totalPages: number, bookText: string, voiceCard: string = ''): string {
  const expected = computeExpectedPages(format, totalPages);
  const pagesPerOutput = Math.round(totalPages / expected);

  return `You are a literary condensation engine. The following book has ${totalPages} pages. You MUST produce EXACTLY ${expected} output pages.

CRITICAL — FULL COVERAGE: Divide all ${totalPages} pages evenly across your ${expected} output pages. Each output page covers roughly ${pagesPerOutput} consecutive original pages. Page 1 covers the beginning, page ${expected} covers the ending. The reader must experience the complete book from start to finish — no gaps, no skipped sections.

STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count carefully.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

Instructions:
1. Extract title and author.
2. Write a one-paragraph summary of the entire book (100-150 words).
3. Produce EXACTLY ${expected} output pages.

Use this EXACT text format with these markers. Do not add JSON, code fences, or any other wrapping. Use the markers verbatim — a single line each, on their own line.

<<<TITLE>>>
(book title on one line)
<<<END TITLE>>>

<<<AUTHOR>>>
(author name on one line)
<<<END AUTHOR>>>

<<<SUMMARY>>>
(100-150 word book summary — can span multiple lines)
<<<END SUMMARY>>>

<<<PAGE 1>>>
(60-80 word page content — can span multiple lines)
<<<END PAGE 1>>>

<<<PAGE 2>>>
(60-80 word page content)
<<<END PAGE 2>>>

...continue numbering through PAGE ${expected}. Use the exact integer page numbers in both the start and end markers. No text outside these markers.

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
  voiceCard: string = '',
): string {
  const isFirst = batchIndex === 0;

  const metaInstructions = isFirst
    ? `Instructions:
1. Extract the book's title and author.
2. Write a one-paragraph summary of the ENTIRE book (100-150 words).
3. Produce EXACTLY ${pagesInBatch} output pages numbered ${startPage} through ${endPage}.`
    : `Instructions:
Produce EXACTLY ${pagesInBatch} output pages numbered ${startPage} through ${endPage}. Do NOT include title, author, or summary — only pages.`;

  const metaBlock = isFirst
    ? `<<<TITLE>>>
(book title on one line)
<<<END TITLE>>>

<<<AUTHOR>>>
(author name on one line)
<<<END AUTHOR>>>

<<<SUMMARY>>>
(100-150 word book summary — can span multiple lines)
<<<END SUMMARY>>>

`
    : '';

  return `You are a literary condensation engine. You are creating a ${totalOutputPages}-page condensed version of a ${totalPdfPages}-page book.

This text excerpt contains pages ${pdfStart}-${pdfEnd} of the original book (batch ${batchIndex + 1} of ${totalBatches}). Generate EXACTLY ${pagesInBatch} output pages that cover ALL content in this excerpt. Every page must be represented — read it completely from start to finish.

STRICT WORD COUNT: Each page MUST be exactly 60-80 words. Not 40, not 100. Count carefully.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

${metaInstructions}

Use this EXACT text format with these markers. Do not add JSON, code fences, or any other wrapping. Use the markers verbatim — on their own line each.

${metaBlock}<<<PAGE ${startPage}>>>
(60-80 word content)
<<<END PAGE ${startPage}>>>

<<<PAGE ${startPage + 1}>>>
(60-80 word content)
<<<END PAGE ${startPage + 1}>>>

...continue numbering through PAGE ${endPage}. Use the exact integer page numbers in both start and end markers. No text outside these markers.

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

Use this EXACT text format. One <<<FLAG N>>>...<<<END FLAG N>>> block per flagged page, where N is the output page number. The body is a short description of the issue.

<<<FLAG 3>>>
short description of the issue
<<<END FLAG 3>>>

<<<FLAG 7>>>
short description of the issue
<<<END FLAG 7>>>

If nothing is wrong, output only this single line:
<<<NO FLAGS>>>

Do not add JSON, code fences, or any text outside these markers.

${items}`;
}

function buildRegenPrompt(format: FormatType, slice: PageSlice, issue: string, voiceCard: string = ''): string {
  return `You are regenerating a single page that failed a faithfulness check.

ISSUE REPORTED: ${issue}

Regenerate the page strictly from the source below. Do not introduce anything not in the source.

STRICT WORD COUNT: exactly 60-80 words.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

Use this EXACT text format. Do not add JSON, code fences, or any text outside the markers.

<<<CONTENT>>>
(60-80 word content)
<<<END CONTENT>>>

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

export const DEFAULT_WORD_COUNT_MAX = 110;
const VALIDATOR_TEMP = 0.2;

async function validateAndRepair(
  callApi: TextCallFn,
  format: FormatType,
  pages: GeneratedPage[],
  slices: PageSlice[],
  wordCountMax: number,
  onStatus?: (msg: string) => void,
  voiceCard: string = '',
): Promise<GeneratedPage[]> {
  const flaggedMap = new Map<number, string>();

  // Deterministic: flag any page that exceeds word-count tolerance.
  for (const p of pages) {
    const wc = countWords(p.content);
    if (wc > wordCountMax) {
      flaggedMap.set(p.pageNumber, `word count too high: ${wc} words (cap ${wordCountMax})`);
    }
  }

  // LLM judge for faithfulness.
  try {
    const parsed = await callWithRetry(() =>
      callAndParse(callApi, buildValidatorPrompt(pages, slices), { temperature: VALIDATOR_TEMP }),
      onStatus,
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
    console.warn('Validator pass failed', e);
    throw e;
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
        callAndParse(callApi, buildRegenPrompt(format, slice, issue, voiceCard), { temperature: VALIDATOR_TEMP }),
        onStatus,
      );
      const content = parsed?.content;
      if (typeof content === 'string' && content.trim()) {
        result[idx] = { ...result[idx], content };
      }
    } catch (e) {
      console.warn(`Regen failed for page ${pageNumber}`, e);
      throw e;
    }
  }
  return result;
}

// ---------- Retry helper ----------

async function callWithRetry<T>(fn: () => Promise<T>, onStatus?: (msg: string) => void): Promise<T> {
  let attempt = 1;
  // Retries indefinitely — caller (UI) can cancel by unmounting or closing the app.
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      const errMsg = (e as Error)?.message || String(e);
      console.warn(`Batch attempt ${attempt} failed, retrying in ${delay}ms...`, e);
      onStatus?.(`Retry ${attempt + 1} in ${Math.round(delay / 1000)}s — ${errMsg.substring(0, 120)}`);
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
      attempt++;
    }
  }
}

// Extracts the first block delimited by <<<TAG>>> ... <<<END TAG>>> (multiline).
function extractBlock(raw: string, tag: string): string | undefined {
  const re = new RegExp(`<<<\\s*${tag}\\s*>>>([\\s\\S]*?)<<<\\s*END\\s+${tag}\\s*>>>`, 'i');
  const m = raw.match(re);
  return m ? m[1].trim() : undefined;
}

// Parses all <<<PAGE N>>> ... <<<END PAGE N>>> blocks into [{pageNumber, content}].
function extractPageBlocks(raw: string): { pageNumber: number; content: string }[] {
  const re = /<<<\s*PAGE\s+(\d+)\s*>>>([\s\S]*?)<<<\s*END\s+PAGE\s+\1\s*>>>/gi;
  const pages: { pageNumber: number; content: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    pages.push({ pageNumber: parseInt(m[1], 10), content: m[2].trim() });
  }
  return pages;
}

// Parses all <<<FLAG N>>> ... <<<END FLAG N>>> blocks into [{pageNumber, issue}].
function extractFlagBlocks(raw: string): { pageNumber: number; issue: string }[] {
  const re = /<<<\s*FLAG\s+(\d+)\s*>>>([\s\S]*?)<<<\s*END\s+FLAG\s+\1\s*>>>/gi;
  const flags: { pageNumber: number; issue: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    flags.push({ pageNumber: parseInt(m[1], 10), issue: m[2].trim() });
  }
  return flags;
}

// Strip common wrapping the model might add despite instructions (code fences).
function stripWrapping(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '');
    s = s.replace(/\n?```\s*$/, '');
  }
  return s.trim();
}

async function callAndParse(callApi: TextCallFn, prompt: string, opts?: TextCallOpts): Promise<any> {
  const raw = stripWrapping(await callApi(prompt, opts));

  const pages = extractPageBlocks(raw);
  const flagged = extractFlagBlocks(raw);
  const hasNoFlags = /<<<\s*NO\s+FLAGS\s*>>>/i.test(raw);

  const result: any = {
    title: extractBlock(raw, 'TITLE'),
    author: extractBlock(raw, 'AUTHOR'),
    summary: extractBlock(raw, 'SUMMARY'),
    content: extractBlock(raw, 'CONTENT'),
  };
  if (pages.length > 0) result.pages = pages;
  if (flagged.length > 0 || hasNoFlags) result.flagged = flagged;

  // If nothing recognizable came back, surface a clear error with a preview.
  const anyField =
    result.title || result.author || result.summary || result.content ||
    result.pages || result.flagged;
  if (!anyField) {
    throw new Error(`Malformed response — no recognized markers. preview: ${raw.substring(0, 200)}`);
  }
  return result;
}

// ---------- Strategy 2: Voice Card ----------

function buildVoiceCardPrompt(sampleA: string, sampleB: string, sampleC: string): string {
  return `You are a literary style analyst. Read the three passages below (beginning / middle / end of a book) and produce a compact style card (~300 tokens max). Capture: diction level, sentence rhythm, POV, tense, signature devices, 2-3 representative sentences quoted verbatim. This card will be injected into every subsequent generation prompt — be concrete and actionable, not abstract.

Use this EXACT text format. Do not add JSON, code fences, or any text outside the markers.

<<<VOICE>>>
(the style card — diction, rhythm, POV, tense, devices, representative sentences)
<<<END VOICE>>>

--- PASSAGE A (beginning) ---
${sampleA}

--- PASSAGE B (middle) ---
${sampleB}

--- PASSAGE C (end) ---
${sampleC}`;
}

async function buildVoiceCard(ocrPages: OcrPage[], callApi: TextCallFn, onStatus?: (msg: string) => void): Promise<string> {
  if (ocrPages.length === 0) return '';
  const pick = (idx: number) => ocrPages[Math.max(0, Math.min(ocrPages.length - 1, idx))]?.text || '';
  const sampleA = pick(Math.floor(ocrPages.length * 0.1));
  const sampleB = pick(Math.floor(ocrPages.length * 0.5));
  const sampleC = pick(Math.floor(ocrPages.length * 0.9));
  onStatus?.('Extracting voice card...');
  const raw = stripWrapping(await callApi(buildVoiceCardPrompt(sampleA, sampleB, sampleC), { temperature: 0.3 }));
  const card = extractBlock(raw, 'VOICE') || '';
  return card.trim();
}

function voiceCardBlock(card: string): string {
  if (!card) return '';
  return `\n\nAUTHOR VOICE CARD — match this exactly:\n${card}\n`;
}

// ---------- Strategy 1: Semantic Chunking ----------

interface SemanticChunk {
  pdfStart: number;
  pdfEnd: number;
  importance: number; // 0-10
  label: string;
}

function buildSemanticAnchorsPrompt(ocrPages: OcrPage[]): string {
  // Feed a truncated view so we stay within context — first N chars per page.
  const compact = ocrPages.map((p) => `P${p.pageNum}: ${p.text.substring(0, 400).replace(/\s+/g, ' ')}`).join('\n');
  return `You are a book structure analyst. Identify semantic chunks — scenes, chapters, or distinct arguments — by their START and END page numbers. Also rate each chunk's narrative importance 0-10 (10 = pivotal turning point, 0 = filler). Chunks must be contiguous and cover all pages 1-${ocrPages.length}. Expect between 5 and 30 chunks.

Use this EXACT text format. Do not add JSON, code fences, or any text outside markers.

<<<CHUNK 1>>>
start: <int>
end: <int>
importance: <int 0-10>
label: <short label>
<<<END CHUNK 1>>>

<<<CHUNK 2>>>
...
<<<END CHUNK 2>>>

--- BOOK (page previews) ---
${compact}`;
}

function extractSemanticChunks(raw: string): SemanticChunk[] {
  const re = /<<<\s*CHUNK\s+\d+\s*>>>([\s\S]*?)<<<\s*END\s+CHUNK\s+\d+\s*>>>/gi;
  const chunks: SemanticChunk[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const body = m[1];
    const start = parseInt(body.match(/start\s*:\s*(\d+)/i)?.[1] || '0', 10);
    const end = parseInt(body.match(/end\s*:\s*(\d+)/i)?.[1] || '0', 10);
    const importance = parseInt(body.match(/importance\s*:\s*(\d+)/i)?.[1] || '5', 10);
    const label = (body.match(/label\s*:\s*([^\n]+)/i)?.[1] || '').trim();
    if (start > 0 && end >= start) {
      chunks.push({ pdfStart: start, pdfEnd: end, importance: Math.max(0, Math.min(10, importance)), label });
    }
  }
  return chunks;
}

async function detectSemanticChunks(ocrPages: OcrPage[], callApi: TextCallFn, onStatus?: (msg: string) => void): Promise<SemanticChunk[]> {
  onStatus?.('Detecting semantic chunks...');
  try {
    const raw = stripWrapping(await callApi(buildSemanticAnchorsPrompt(ocrPages), { temperature: 0.2 }));
    const chunks = extractSemanticChunks(raw);
    if (chunks.length === 0) return [];
    // Clamp to book bounds.
    return chunks.map((c) => ({
      ...c,
      pdfStart: Math.max(1, Math.min(ocrPages.length, c.pdfStart)),
      pdfEnd: Math.max(1, Math.min(ocrPages.length, c.pdfEnd)),
    })).filter((c) => c.pdfEnd >= c.pdfStart);
  } catch (e) {
    console.warn('Semantic chunk detection failed, falling back to uniform.', e);
    return [];
  }
}

// Allocate output pages across chunks weighted by importance (flex ±10% vs uniform).
interface AllocatedChunk extends SemanticChunk {
  outStart: number;
  outEnd: number;
  outCount: number;
}

function allocateOutputPages(chunks: SemanticChunk[], expectedPages: number): AllocatedChunk[] {
  if (chunks.length === 0) return [];
  const totalWeight = chunks.reduce((s, c) => s + Math.max(1, c.importance), 0);
  // Raw float allocations
  const raw = chunks.map((c) => (Math.max(1, c.importance) / totalWeight) * expectedPages);
  // Floor + distribute remainder by largest fractional part
  const base = raw.map((v) => Math.floor(v));
  let assigned = base.reduce((s, v) => s + v, 0);
  const remainders = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  let ri = 0;
  while (assigned < expectedPages && ri < remainders.length) {
    base[remainders[ri].i]++;
    assigned++;
    ri++;
  }
  // Ensure each chunk gets at least 1 output page
  for (let i = 0; i < base.length; i++) {
    if (base[i] < 1) {
      // steal from largest
      let maxIdx = 0;
      for (let j = 0; j < base.length; j++) if (base[j] > base[maxIdx]) maxIdx = j;
      if (base[maxIdx] > 1) { base[maxIdx]--; base[i]++; }
    }
  }
  let cursor = 1;
  return chunks.map((c, i) => {
    const outStart = cursor;
    const outEnd = Math.min(expectedPages, cursor + base[i] - 1);
    cursor = outEnd + 1;
    return { ...c, outStart, outEnd, outCount: outEnd - outStart + 1 };
  }).filter((a) => a.outCount > 0);
}

// ---------- Strategy 3: Per-Page Generation + Smoothing ----------

function buildSinglePagePrompt(
  format: FormatType,
  pageNumber: number,
  totalOutputPages: number,
  pdfStart: number,
  pdfEnd: number,
  sliceText: string,
  voiceCard: string,
  label?: string,
): string {
  const labelLine = label ? `\nThis section is: ${label}.` : '';
  return `You are a literary condensation engine. You are generating output page ${pageNumber} of ${totalOutputPages} for a condensed book version.${labelLine}

This output page covers the source excerpt below (PDF pages ${pdfStart}-${pdfEnd}). Produce ONE page that condenses this excerpt faithfully — no cross-page interference, maximum fidelity to this slice.

STRICT WORD COUNT: exactly 60-80 words.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

Use this EXACT text format. No JSON, no code fences, no text outside the markers.

<<<CONTENT>>>
(60-80 word page content)
<<<END CONTENT>>>

--- SOURCE (PDF pages ${pdfStart}-${pdfEnd}) ---
${sliceText}`;
}

function buildSmoothingPrompt(
  format: FormatType,
  chunkPages: GeneratedPage[],
  prevNeighbor: GeneratedPage | null,
  nextNeighbor: GeneratedPage | null,
  voiceCard: string,
): string {
  const neighborIntro = (prevNeighbor || nextNeighbor)
    ? `CONTEXT NEIGHBORS (read-only, do NOT rewrite — only use for tone/flow context):\n${prevNeighbor ? `Previous page ${prevNeighbor.pageNumber}:\n${prevNeighbor.content}\n\n` : ''}${nextNeighbor ? `Next page ${nextNeighbor.pageNumber}:\n${nextNeighbor.content}\n\n` : ''}`
    : '';

  const targets = chunkPages.map((p) => `<<<SMOOTHED ${p.pageNumber}>>>\n(smoothed 60-80 word content)\n<<<END SMOOTHED ${p.pageNumber}>>>`).join('\n\n');
  const sources = chunkPages.map((p) => `--- Page ${p.pageNumber} (draft) ---\n${p.content}`).join('\n\n');

  return `You are a literary smoother. Rephrase the draft pages below so they flow together as one continuous read. Fix batch seams, tone jumps, awkward handoffs. PHRASING ONLY — do not change meaning, add content, or remove ideas. Keep each page at 60-80 words.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

${neighborIntro}Rewrite every draft page below. Use this EXACT text format. No JSON, no code fences, no text outside markers.

${targets}

${sources}`;
}

async function generatePerPage(
  format: FormatType,
  ocrPages: OcrPage[],
  allocations: AllocatedChunk[] | null, // null = uniform allocation across full book
  totalOutputPages: number,
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
): Promise<GeneratedPage[]> {
  // Flatten allocations into per-output-page slices.
  interface PerPageTask { outPage: number; pdfStart: number; pdfEnd: number; sliceText: string; label?: string }
  const tasks: PerPageTask[] = [];

  if (allocations && allocations.length > 0) {
    for (const alloc of allocations) {
      const pdfSpan = alloc.pdfEnd - alloc.pdfStart + 1;
      const perOut = pdfSpan / alloc.outCount;
      for (let i = 0; i < alloc.outCount; i++) {
        const pdfStart = alloc.pdfStart + Math.floor(i * perOut);
        const pdfEnd = Math.max(pdfStart, alloc.pdfStart + Math.floor((i + 1) * perOut) - 1);
        const slice = ocrPages.filter((p) => p.pageNum >= pdfStart && p.pageNum <= pdfEnd);
        const sliceText = slice.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
        tasks.push({ outPage: alloc.outStart + i, pdfStart, pdfEnd, sliceText, label: alloc.label });
      }
    }
  } else {
    const totalPdf = ocrPages.length;
    const perOut = totalPdf / totalOutputPages;
    for (let i = 0; i < totalOutputPages; i++) {
      const pdfStart = 1 + Math.floor(i * perOut);
      const pdfEnd = Math.max(pdfStart, Math.floor((i + 1) * perOut));
      const slice = ocrPages.filter((p) => p.pageNum >= pdfStart && p.pageNum <= pdfEnd);
      const sliceText = slice.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
      tasks.push({ outPage: i + 1, pdfStart, pdfEnd, sliceText });
    }
  }

  const pages: GeneratedPage[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    onStatus?.(`Per-page ${i + 1}/${tasks.length} — page ${t.outPage} (PDF ${t.pdfStart}-${t.pdfEnd})...`);
    const prompt = buildSinglePagePrompt(format, t.outPage, totalOutputPages, t.pdfStart, t.pdfEnd, t.sliceText, voiceCard, t.label);
    const parsed = await callWithRetry(() => callAndParse(callApi, prompt), onStatus);
    const content = typeof parsed?.content === 'string' ? parsed.content.trim() : '';
    if (!content) throw new Error(`Per-page generation returned empty content for page ${t.outPage}`);
    pages.push({ pageNumber: t.outPage, content });
  }
  return pages;
}

async function smoothPages(
  format: FormatType,
  pages: GeneratedPage[],
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
): Promise<GeneratedPage[]> {
  if (pages.length === 0) return pages;
  const result = pages.map((p) => ({ ...p }));
  const chunkSize = SMOOTHING_CHUNK_SIZE;
  const totalChunks = Math.ceil(result.length / chunkSize);

  for (let ci = 0; ci < totalChunks; ci++) {
    const startIdx = ci * chunkSize;
    const endIdx = Math.min(startIdx + chunkSize, result.length);
    const chunkPages = result.slice(startIdx, endIdx);
    const prev = startIdx > 0 ? result[startIdx - 1] : null;
    const next = endIdx < result.length ? result[endIdx] : null;

    onStatus?.(`Smoothing chunk ${ci + 1}/${totalChunks} (pages ${chunkPages[0].pageNumber}-${chunkPages[chunkPages.length - 1].pageNumber})...`);

    const prompt = buildSmoothingPrompt(format, chunkPages, prev, next, voiceCard);
    const raw = stripWrapping(await callWithRetry(() => callApi(prompt, { temperature: 0.5 }), onStatus));

    // Parse <<<SMOOTHED N>>> ... <<<END SMOOTHED N>>> blocks.
    const re = /<<<\s*SMOOTHED\s+(\d+)\s*>>>([\s\S]*?)<<<\s*END\s+SMOOTHED\s+\1\s*>>>/gi;
    let m: RegExpExecArray | null;
    const byPage = new Map<number, string>();
    while ((m = re.exec(raw)) !== null) {
      byPage.set(parseInt(m[1], 10), m[2].trim());
    }
    for (let i = 0; i < chunkPages.length; i++) {
      const p = chunkPages[i];
      const smoothed = byPage.get(p.pageNumber);
      if (smoothed) {
        const idxInResult = startIdx + i;
        result[idxInResult] = { ...result[idxInResult], content: smoothed };
      } else {
        console.warn(`Smoothing skipped page ${p.pageNumber} — no block found`);
      }
    }
  }
  return result;
}

// ---------- Strategy 4: Back-Check by Expansion ----------

function buildExpansionPrompt(page: GeneratedPage, sliceText: string): string {
  const sourceWords = countWords(sliceText);
  return `You are an expansion engine. Expand the condensed page below back to approximately ${sourceWords} words — filling in the plausible detail the original source would have contained. This is for faithfulness auditing, so your expansion should cover every implication of the condensed page.

Use this EXACT text format. No JSON, no code fences.

<<<EXPANSION>>>
(expanded ~${sourceWords} word text)
<<<END EXPANSION>>>

--- CONDENSED PAGE ${page.pageNumber} ---
${page.content}`;
}

function buildBackCheckJudgePrompt(page: GeneratedPage, expansion: string, sliceText: string): string {
  return `You are a faithfulness judge. Compare a reconstruction (what an expander produced from a condensed page) against the actual source. Score 0.0 (completely different — major omissions or fabrications) to 1.0 (covers the same events/ideas).

Use this EXACT text format. No JSON, no code fences.

<<<SCORE>>>
(single number 0.0-1.0)
<<<END SCORE>>>

<<<REASON>>>
(one sentence — what was omitted or fabricated, if anything)
<<<END REASON>>>

--- ACTUAL SOURCE ---
${sliceText}

--- RECONSTRUCTION ---
${expansion}`;
}

async function backCheckAndRegen(
  format: FormatType,
  pages: GeneratedPage[],
  slices: PageSlice[],
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
): Promise<GeneratedPage[]> {
  const result = [...pages];
  for (let i = 0; i < result.length; i++) {
    const page = result[i];
    const slice = slices.find((s) => s.pageNumber === page.pageNumber);
    if (!slice) continue;
    onStatus?.(`Back-check ${i + 1}/${result.length} — expanding page ${page.pageNumber}...`);

    let expansion = '';
    try {
      const raw = stripWrapping(await callWithRetry(() => callApi(buildExpansionPrompt(page, slice.sliceText), { temperature: 0.4 }), onStatus));
      expansion = extractBlock(raw, 'EXPANSION') || '';
    } catch (e) {
      console.warn(`Back-check expansion failed page ${page.pageNumber}`, e);
      continue;
    }
    if (!expansion) continue;

    let score = 1.0;
    let reason = '';
    try {
      const raw = stripWrapping(await callWithRetry(() => callApi(buildBackCheckJudgePrompt(page, expansion, slice.sliceText), { temperature: VALIDATOR_TEMP }), onStatus));
      const scoreStr = extractBlock(raw, 'SCORE') || '';
      const parsed = parseFloat(scoreStr);
      if (Number.isFinite(parsed)) score = parsed;
      reason = extractBlock(raw, 'REASON') || '';
    } catch (e) {
      console.warn(`Back-check judge failed page ${page.pageNumber}`, e);
      continue;
    }

    if (score < BACK_CHECK_DELTA_THRESHOLD) {
      onStatus?.(`Regen page ${page.pageNumber} — back-check score ${score.toFixed(2)}: ${reason.substring(0, 60)}`);
      for (let attempt = 0; attempt < BACK_CHECK_MAX_REGENS; attempt++) {
        try {
          const raw = stripWrapping(await callWithRetry(() => callApi(buildRegenPrompt(format, slice, `back-check omission: ${reason}`, voiceCard), { temperature: VALIDATOR_TEMP }), onStatus));
          const content = extractBlock(raw, 'CONTENT');
          if (content && content.trim()) {
            result[i] = { ...result[i], content: content.trim() };
          }
        } catch (e) {
          console.warn(`Back-check regen failed page ${page.pageNumber}`, e);
        }
      }
    }
  }
  return result;
}

// ---------- Strategy 5: Highlight-Driven Importance Map ----------

type Importance = 'story' | 'semi-filler' | 'filler';

interface PageHighlight {
  pageNum: number;
  highlight: string;
}

function buildHighlightPrompt(page: OcrPage, totalPages: number): string {
  return `You are reading page ${page.pageNum} of a ${totalPages}-page book. Produce a brief 1-3 sentence highlight: what happens here, or what's the core point. Be concrete — name characters/places/concepts. No generic summary.

Use this EXACT text format. No JSON, no code fences.

<<<HIGHLIGHT>>>
(1-3 sentence highlight)
<<<END HIGHLIGHT>>>

--- PAGE ${page.pageNum} ---
${page.text}`;
}

// Contract: <<<CAT N>>> uses N as the 1-based sequential index into the highlights array
// passed to the prompt — NOT the OCR pageNum. This avoids silent failure when OCR pageNums
// skip front matter or are non-contiguous. Parser maps N back to highlights[N-1].pageNum.
function buildClassifyPrompt(highlights: PageHighlight[]): string {
  const list = highlights.map((h, i) => `Item ${i + 1}: ${h.highlight}`).join('\n');
  return `You are categorizing pages of a book by narrative importance. Read all highlights together, then classify each item as one of: story, semi-filler, filler.

- story: pivotal — turning points, key arguments, dramatic scenes, core thesis moments
- semi-filler: meaningful but not pivotal — supporting examples, character beats, secondary arguments
- filler: low-stakes — filler description, repetition, transitional padding

Use this EXACT text format. One <<<CAT N>>> block per item, where N matches the Item number above. You MUST emit a block for EVERY item from 1 to ${highlights.length}.

<<<CAT 1>>>
story
<<<END CAT 1>>>

<<<CAT 2>>>
filler
<<<END CAT 2>>>

...continue for every item up to ${highlights.length}.

--- HIGHLIGHTS ---
${list}`;
}

function extractCategories(raw: string, highlights: PageHighlight[]): Map<number, Importance> {
  const re = /<<<\s*CAT\s+(\d+)\s*>>>([\s\S]*?)<<<\s*END\s+CAT\s+\1\s*>>>/gi;
  const out = new Map<number, Importance>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx < 1 || idx > highlights.length) continue;
    const pageNum = highlights[idx - 1].pageNum;
    const body = m[2].trim().toLowerCase();
    let cat: Importance = 'semi-filler';
    if (body.startsWith('story')) cat = 'story';
    else if (body.startsWith('filler')) cat = 'filler';
    else if (body.startsWith('semi')) cat = 'semi-filler';
    out.set(pageNum, cat);
  }
  return out;
}

function buildImportanceGenPrompt(
  format: FormatType,
  page: OcrPage,
  category: Importance,
  highlightMap: PageHighlight[],
  importanceMap: Map<number, Importance>,
  voiceCard: string,
): string {
  const expansionRule =
    category === 'filler'
      ? `This page is FILLER. Compress aggressively. Output 0 or 1 pages. If the content is truly throwaway, emit zero <<<PAGE>>> blocks. Otherwise emit ONE 60-80 word page that captures only the bare minimum.`
      : category === 'semi-filler'
      ? `This page is SEMI-FILLER. Condense 1:1 — emit exactly ONE 60-80 word page covering the meaningful content of this source page.`
      : `This page is STORY. Expand if warranted — emit 1, 2, or 3 60-80 word pages so each pivotal beat gets full breathing room. Each page must cover a distinct moment/idea from this source page; do not pad.`;

  const mapPreview = highlightMap
    .map((h) => `P${h.pageNum} [${importanceMap.get(h.pageNum) || 'semi-filler'}]: ${h.highlight.substring(0, 120)}`)
    .join('\n');

  return `You are a literary condensation engine using importance-aware page expansion. You are processing source page ${page.pageNum}.

${expansionRule}

STRICT WORD COUNT: each output page MUST be 60-80 words.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

GLOBAL CONTEXT — full book importance map (for tone/continuity, do not retell other pages):
${mapPreview}

Use this EXACT text format. Emit zero or more <<<PAGE N>>> blocks where N is a sequential local index (1, 2, ...). No JSON, no code fences, no text outside markers.

<<<PAGE 1>>>
(60-80 word content)
<<<END PAGE 1>>>

(emit additional <<<PAGE 2>>>, <<<PAGE 3>>> only if STORY page warrants it)

--- SOURCE PAGE ${page.pageNum} ---
${page.text}`;
}

async function extractHighlights(
  ocrPages: OcrPage[],
  callApi: TextCallFn,
  onStatus?: (msg: string) => void,
): Promise<PageHighlight[]> {
  const highlights: PageHighlight[] = [];
  for (let i = 0; i < ocrPages.length; i++) {
    const p = ocrPages[i];
    onStatus?.(`Extracting highlights ${i + 1}/${ocrPages.length} (page ${p.pageNum})...`);
    const raw = stripWrapping(await callWithRetry(() => callApi(buildHighlightPrompt(p, ocrPages.length), { temperature: 0.3 }), onStatus));
    const h = extractBlock(raw, 'HIGHLIGHT') || '';
    highlights.push({ pageNum: p.pageNum, highlight: h.trim() || '(no highlight)' });
  }
  return highlights;
}

async function classifyImportance(
  highlights: PageHighlight[],
  callApi: TextCallFn,
  onStatus?: (msg: string) => void,
): Promise<Map<number, Importance>> {
  onStatus?.('Classifying importance...');
  const raw1 = stripWrapping(await callWithRetry(() => callApi(buildClassifyPrompt(highlights), { temperature: 0.2 }), onStatus));
  let map = extractCategories(raw1, highlights);

  // Coverage check: if <80% of items classified, retry once with stricter prompt.
  const threshold = Math.floor(highlights.length * 0.8);
  if (map.size < threshold) {
    onStatus?.(`Classify coverage low (${map.size}/${highlights.length}); retrying...`);
    const stricter = buildClassifyPrompt(highlights) + `\n\nIMPORTANT: your previous response was incomplete. You MUST emit exactly ${highlights.length} <<<CAT N>>> blocks, one for every item from 1 to ${highlights.length}. Do not skip any.`;
    const raw2 = stripWrapping(await callWithRetry(() => callApi(stricter, { temperature: 0.2 }), onStatus));
    const map2 = extractCategories(raw2, highlights);
    if (map2.size > map.size) map = map2;
  }

  if (map.size < threshold) {
    onStatus?.(`Warning: classify still incomplete (${map.size}/${highlights.length}); missing pages default to semi-filler.`);
  }

  // Fill missing pages with semi-filler default.
  for (const h of highlights) {
    if (!map.has(h.pageNum)) map.set(h.pageNum, 'semi-filler');
  }
  return map;
}

async function generateByImportance(
  format: FormatType,
  ocrPages: OcrPage[],
  highlights: PageHighlight[],
  importance: Map<number, Importance>,
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
): Promise<{ pages: GeneratedPage[]; sourceByOutput: Map<number, number> }> {
  const pages: GeneratedPage[] = [];
  const sourceByOutput = new Map<number, number>(); // output pageNumber → source pageNum
  let outCounter = 0;

  for (let i = 0; i < ocrPages.length; i++) {
    const src = ocrPages[i];
    const cat = importance.get(src.pageNum) || 'semi-filler';
    onStatus?.(`Generating page ${i + 1}/${ocrPages.length} [${cat}] (source ${src.pageNum})...`);

    const prompt = buildImportanceGenPrompt(format, src, cat, highlights, importance, voiceCard);
    const raw = stripWrapping(await callWithRetry(() => callApi(prompt, { temperature: 0.6 }), onStatus));
    let blocks = extractPageBlocks(raw);

    if (blocks.length === 0 && cat !== 'filler') {
      // Non-filler returning nothing — retry once with stricter prompt.
      onStatus?.(`Empty non-filler page ${src.pageNum}; retrying with stricter prompt...`);
      const stricter = prompt + `\n\nIMPORTANT: your previous response emitted zero pages. This source page is ${cat.toUpperCase()} and you MUST emit at least ONE <<<PAGE 1>>> block. Do not return empty.`;
      const raw2 = stripWrapping(await callWithRetry(() => callApi(stricter, { temperature: 0.6 }), onStatus));
      blocks = extractPageBlocks(raw2);
      if (blocks.length === 0) {
        onStatus?.(`Warning: ${cat} source page ${src.pageNum} produced no output after retry; story beat lost.`);
        console.warn(`Importance gen returned zero pages for non-filler source ${src.pageNum} after retry`);
      }
    }

    // Hard caps per category so a misbehaving model can't blow up output.
    const maxByCategory = cat === 'filler' ? 1 : cat === 'semi-filler' ? 1 : 3;
    if (blocks.length > maxByCategory) {
      onStatus?.(`Warning: ${cat} source page ${src.pageNum} emitted ${blocks.length} pages; capping at ${maxByCategory}.`);
    }
    const capped = blocks.slice(0, maxByCategory);

    for (const b of capped) {
      outCounter++;
      pages.push({ pageNumber: outCounter, content: b.content });
      sourceByOutput.set(outCounter, src.pageNum);
    }
  }

  return { pages, sourceByOutput };
}

function computePageSlicesFromSourceMap(
  ocrPages: OcrPage[],
  pages: GeneratedPage[],
  sourceByOutput: Map<number, number>,
): PageSlice[] {
  return pages.map((p) => {
    const srcNum = sourceByOutput.get(p.pageNumber) || p.pageNumber;
    const srcPage = ocrPages.find((op) => op.pageNum === srcNum);
    const sliceText = srcPage ? `Page ${srcPage.pageNum} start\n${srcPage.text}\nPage ${srcPage.pageNum} end` : '';
    return { pageNumber: p.pageNumber, sliceStart: srcNum, sliceEnd: srcNum, sliceText };
  });
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
  wordCountMax: number,
  onStatus?: (msg: string) => void,
  flags: StrategyFlags = {},
): Promise<GenerationResult> {
  const totalPdfPages = ocrPages.length;
  const expectedPages = computeExpectedPages(format, totalPdfPages);

  // Strategy 2: Voice Card — one-shot pre-pass if enabled.
  let voiceCard = '';
  if (flags.voiceCard) {
    try {
      voiceCard = await buildVoiceCard(ocrPages, callApi, onStatus);
      if (voiceCard) onStatus?.(`Voice card ready (${voiceCard.length} chars).`);
    } catch (e) {
      console.warn('Voice card generation failed, continuing without', e);
    }
  }

  // Strategy 5: Highlight-Driven Importance Map.
  // Owns the entire generation path — replaces classic batch + per-page+smoothing.
  // Semantic chunking is skipped (this strategy assigns its own importance per source page).
  if (flags.highlightMap) {
    const highlights = await extractHighlights(ocrPages, callApi, onStatus);
    const importance = await classifyImportance(highlights, callApi, onStatus);
    const storyCount = [...importance.values()].filter((c) => c === 'story').length;
    const semiCount = [...importance.values()].filter((c) => c === 'semi-filler').length;
    const fillerCount = [...importance.values()].filter((c) => c === 'filler').length;
    onStatus?.(`Importance map ready: ${storyCount} story / ${semiCount} semi / ${fillerCount} filler.`);

    // Short-circuit: if every page is filler, generation will produce ~0 pages and throw later.
    // Bail early instead of burning N gen calls.
    if (storyCount === 0 && semiCount === 0) {
      throw new Error('Highlight-driven importance map classified every page as filler; nothing to generate.');
    }

    const { pages: rawPages, sourceByOutput } = await generateByImportance(format, ocrPages, highlights, importance, callApi, voiceCard, onStatus);
    if (rawPages.length === 0) {
      throw new Error('Highlight-driven generation produced zero pages');
    }

    // Metadata pass.
    let title = '', author = '', summary = '';
    try {
      onStatus?.('Extracting title / author / summary...');
      const metaPrompt = `Extract book metadata from the excerpts below.

Use this EXACT text format:

<<<TITLE>>>
(book title)
<<<END TITLE>>>

<<<AUTHOR>>>
(author name)
<<<END AUTHOR>>>

<<<SUMMARY>>>
(100-150 word summary of the entire book)
<<<END SUMMARY>>>

--- BOOK START ---
${ocrPages.slice(0, 3).map((p) => p.text).join('\n\n').substring(0, 3000)}

--- BOOK END ---
${ocrPages.slice(-2).map((p) => p.text).join('\n\n').substring(0, 2000)}`;
      const parsed = await callWithRetry(() => callAndParse(callApi, metaPrompt, { temperature: 0.3 }), onStatus);
      title = parsed.title || '';
      author = parsed.author || '';
      summary = parsed.summary || '';
    } catch (e) {
      console.warn('Metadata extraction failed', e);
    }

    const slices = computePageSlicesFromSourceMap(ocrPages, rawPages, sourceByOutput);
    onStatus?.('Validating pages against source...');
    let pages = await validateAndRepair(callApi, format, rawPages, slices, wordCountMax, onStatus, voiceCard);

    if (flags.backCheck) {
      pages = await backCheckAndRegen(format, pages, slices, callApi, voiceCard, onStatus);
    }

    return { title, author, summary, pages };
  }

  // Strategy 1: Semantic Chunking — detect narrative boundaries + allocate output pages.
  // Skip when single-shot batch path will be taken (allocations unused there).
  let allocations: AllocatedChunk[] | null = null;
  const willSingleShot = !flags.perPageSmoothing && expectedPages <= BATCH_SIZE;
  if (flags.semanticChunking && !willSingleShot) {
    const chunks = await detectSemanticChunks(ocrPages, callApi, onStatus);
    if (chunks.length > 0) {
      allocations = allocateOutputPages(chunks, expectedPages);
      onStatus?.(`Semantic chunking: ${allocations.length} chunks allocated.`);
    }
  }

  // Strategy 3: Per-Page Generation + Chunked Smoothing path.
  if (flags.perPageSmoothing) {
    let pages = await generatePerPage(format, ocrPages, allocations, expectedPages, callApi, voiceCard, onStatus);

    // Extract title/author/summary — piggyback on voice card sample OR do a dedicated pass.
    let title = '', author = '', summary = '';
    try {
      onStatus?.('Extracting title / author / summary...');
      const metaPrompt = `Extract book metadata from the excerpts below.

Use this EXACT text format:

<<<TITLE>>>
(book title)
<<<END TITLE>>>

<<<AUTHOR>>>
(author name)
<<<END AUTHOR>>>

<<<SUMMARY>>>
(100-150 word summary of the entire book)
<<<END SUMMARY>>>

--- BOOK START ---
${ocrPages.slice(0, 3).map((p) => p.text).join('\n\n').substring(0, 3000)}

--- BOOK END ---
${ocrPages.slice(-2).map((p) => p.text).join('\n\n').substring(0, 2000)}`;
      const parsed = await callWithRetry(() => callAndParse(callApi, metaPrompt, { temperature: 0.3 }), onStatus);
      title = parsed.title || '';
      author = parsed.author || '';
      summary = parsed.summary || '';
    } catch (e) {
      console.warn('Metadata extraction failed', e);
    }

    // Smoothing pass.
    onStatus?.('Smoothing pass...');
    pages = await smoothPages(format, pages, callApi, voiceCard, onStatus);

    // Validator still runs (word-cap + fabrication check).
    const slices = computePageSlicesFromAllocations(ocrPages, pages, allocations, expectedPages, totalPdfPages);
    onStatus?.('Validating pages against source...');
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard);

    // Strategy 4: Back-Check by Expansion.
    if (flags.backCheck) {
      pages = await backCheckAndRegen(format, pages, slices, callApi, voiceCard, onStatus);
    }

    return { title, author, summary, pages };
  }

  // ----- Classic batch path (per-page smoothing OFF) -----

  // Small enough — single shot
  if (expectedPages <= BATCH_SIZE) {
    const label = formatLabel(format);
    onStatus?.(`Generating ${expectedPages} ${label} pages...`);
    const bookText = ocrPages.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
    const prompt = buildPrompt(format, totalPdfPages, bookText, voiceCard);
    const parsed = await callWithRetry(() => callAndParse(callApi, prompt), onStatus);
    if (!Array.isArray(parsed?.pages) || parsed.pages.length === 0) {
      throw new Error('No pages returned');
    }

    let pages: GeneratedPage[] = parsed.pages.slice(0, expectedPages).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? i + 1,
      content: p.content || p.summary || '',
    }));

    if (pages.every((p) => !p.content.trim())) {
      throw new Error('Generation returned empty content for all pages');
    }

    onStatus?.('Validating pages against source...');
    const slices = computePageSlices(ocrPages, pages, 1, totalPdfPages);
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard);

    if (flags.backCheck) {
      pages = await backCheckAndRegen(format, pages, slices, callApi, voiceCard, onStatus);
    }

    return {
      title: parsed.title || '',
      author: parsed.author || '',
      summary: parsed.summary || '',
      pages,
    };
  }

  // Batch mode — split OCR text into chunks.
  // If semantic chunking is on, derive batch boundaries from allocations (grouping chunks to roughly BATCH_SIZE output pages each).
  const batches: { startPage: number; endPage: number; count: number; pdfStart: number; pdfEnd: number; text: string }[] = [];

  if (allocations && allocations.length > 0) {
    let acc: AllocatedChunk[] = [];
    let accCount = 0;
    const flush = () => {
      if (acc.length === 0) return;
      const startPage = acc[0].outStart;
      const endPage = acc[acc.length - 1].outEnd;
      const pdfStart = acc[0].pdfStart;
      const pdfEnd = acc[acc.length - 1].pdfEnd;
      const chunkPages = ocrPages.filter((p) => p.pageNum >= pdfStart && p.pageNum <= pdfEnd);
      const text = chunkPages.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');
      batches.push({ startPage, endPage, count: endPage - startPage + 1, pdfStart, pdfEnd, text });
      acc = []; accCount = 0;
    };
    for (const a of allocations) {
      acc.push(a);
      accCount += a.outCount;
      if (accCount >= BATCH_SIZE) flush();
    }
    flush();
  } else {
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
  }

  let title = '';
  let author = '';
  let summary = '';
  const allPages: GeneratedPage[] = [];
  const allSlices: PageSlice[] = [];

  for (let b = 0; b < batches.length; b++) {
    const { startPage, endPage, count, pdfStart, pdfEnd, text } = batches[b];
    onStatus?.(`Batch ${b + 1}/${batches.length} — generating pages ${startPage}-${endPage} (PDF pages ${pdfStart}-${pdfEnd})...`);

    const prompt = buildBatchPrompt(
      format, b, batches.length,
      startPage, endPage, count,
      expectedPages, pdfStart, pdfEnd, totalPdfPages,
      text, voiceCard,
    );

    const parsed = await callWithRetry(() => callAndParse(callApi, prompt), onStatus);

    if (b === 0) {
      title = parsed.title || '';
      author = parsed.author || '';
      summary = parsed.summary || '';
    }

    if (!Array.isArray(parsed?.pages) || parsed.pages.length === 0) {
      throw new Error(`Batch ${b + 1}/${batches.length} (pages ${startPage}-${endPage}) returned no pages`);
    }

    let pages: GeneratedPage[] = parsed.pages.slice(0, count).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? startPage + i,
      content: p.content || p.summary || '',
    }));

    const emptyCount = pages.filter((p) => !p.content.trim()).length;
    if (emptyCount === pages.length) {
      throw new Error(`Batch ${b + 1}/${batches.length} (pages ${startPage}-${endPage}) returned empty content for all pages`);
    }

    onStatus?.(`Validating batch ${b + 1}/${batches.length}...`);
    const slices = computePageSlices(ocrPages, pages, pdfStart, pdfEnd);
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard);

    allPages.push(...pages);
    allSlices.push(...slices);
  }

  if (allPages.length === 0) {
    throw new Error('Generation produced no pages across all batches');
  }

  let finalPages = allPages.slice(0, expectedPages);

  // Strategy 4: Back-Check by Expansion (classic path, batch-mode).
  if (flags.backCheck) {
    finalPages = await backCheckAndRegen(format, finalPages, allSlices, callApi, voiceCard, onStatus);
  }

  return { title, author, summary, pages: finalPages };
}

// Helper: compute slices for per-page path using allocations (or uniform fallback).
function computePageSlicesFromAllocations(
  ocrPages: OcrPage[],
  pages: GeneratedPage[],
  allocations: AllocatedChunk[] | null,
  expectedPages: number,
  totalPdfPages: number,
): PageSlice[] {
  if (!allocations || allocations.length === 0) {
    return computePageSlices(ocrPages, pages, 1, totalPdfPages);
  }
  const slices: PageSlice[] = [];
  for (const alloc of allocations) {
    const pdfSpan = alloc.pdfEnd - alloc.pdfStart + 1;
    const perOut = pdfSpan / alloc.outCount;
    for (let i = 0; i < alloc.outCount; i++) {
      const pageNumber = alloc.outStart + i;
      const page = pages.find((p) => p.pageNumber === pageNumber);
      if (!page) continue;
      const sliceStart = alloc.pdfStart + Math.floor(i * perOut);
      const sliceEnd = Math.max(sliceStart, alloc.pdfStart + Math.floor((i + 1) * perOut) - 1);
      const slicePages = ocrPages.filter((op) => op.pageNum >= sliceStart && op.pageNum <= sliceEnd);
      const sliceText = slicePages.map((op) => `Page ${op.pageNum} start\n${op.text}\nPage ${op.pageNum} end`).join('\n\n');
      slices.push({ pageNumber, sliceStart, sliceEnd, sliceText });
    }
  }
  return slices;
}

// ---------- API call factories ----------

function makeGeminiCall(apiKey: string): TextCallFn {
  return async (prompt: string, opts?: TextCallOpts): Promise<string> => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'text/plain',
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
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');

  onStatus?.('Extracting text from PDF...');
  const ocrText = await ocrPdf(fileUri);
  const ocrPages = parseOcrPages(ocrText);
  if (ocrPages.length === 0) throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');

  const totalPages = ocrPages.length;
  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages extracted → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), wordCountMax, onStatus, flags);
}

export async function generateFormatFromPdfOpenRouter(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
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

  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), wordCountMax, onStatus, flags);
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
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), wordCountMax, onStatus, flags);
}

export async function generateFormatFromFullOpenRouter(
  fullPages: { pageNumber: number; content: string }[],
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const useModel = model || OPENROUTER_MODEL;
  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), wordCountMax, onStatus, flags);
}
