import { ocrPdf } from './openrouter';
import {
  saveProgress,
  loadProgress,
  clearProgress,
  resolvePath,
  flagsCompatible,
  markUnitValidated,
  SCHEMA_VERSION,
  ProgressCtx,
  ProgressState,
} from './genProgress';

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
  perPageSmoothing?: boolean;
  wordCountAllocation?: boolean;
  // Chapter-based batching/smoothing. Default ON. Applies to all 3 paths.
  // Classic path: one batch per chapter (vs fixed-20). Per-page/word-count: smoothing
  // runs per chapter slice instead of fixed 5-page chunks.
  chapterDetection?: boolean;
}

// Voice card extraction is skipped for very small inputs — cost/benefit isn't worth it.
const VOICE_CARD_MIN_PAGES = 3;

type FormatType = 'mini' | 'pro' | 'ultra';

// Tuning — chosen defaults per admin-plans.md open Q's.
export const SMOOTHING_CHUNK_SIZE = 5;
const WORD_COUNT_DIVISOR = 240;
const WORD_COUNT_ROUND_THRESHOLD = 0.3;
// Front/back matter lives at edges — sample only N pages from each side when source exceeds threshold to avoid context bloat.
const TRIM_PREVIEW_EDGE_THRESHOLD = 100;
const TRIM_PREVIEW_EDGE_SIZE = 50;

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
  chapterLabel?: string,
): string {
  const isFirst = batchIndex === 0;
  const chapterLine = chapterLabel
    ? `\nThis batch corresponds to: ${chapterLabel}. Treat the excerpt as a self-contained chapter.\n`
    : '';

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
${chapterLine}
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
  progressCtx?: ProgressCtx,
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

  if (flaggedMap.size === 0) {
    if (progressCtx) await saveProgress(progressCtx, { validatedPages: pages, lastCompletedPhase: 'validate' });
    return pages;
  }

  const result = [...pages];
  let iter = 0;
  for (const [pageNumber, issue] of flaggedMap) {
    const slice = slices.find((s) => s.pageNumber === pageNumber);
    const idx = result.findIndex((p) => p.pageNumber === pageNumber);
    if (!slice || idx < 0) { iter++; continue; }
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
    if (progressCtx) {
      await saveProgress(progressCtx, {
        validatedPages: result,
        lastCompletedPhase: 'validate',
        lastCompletedIndex: iter,
      });
    }
    iter++;
  }
  if (progressCtx) await saveProgress(progressCtx, { validatedPages: result, lastCompletedPhase: 'validate' });
  return result;
}

// Per-unit validator. Short-circuits if prior.validatedUnits[unitKey] === true.
// On per-unit failure, logs warning and returns input pages unchanged (matches today's
// permissive behavior elsewhere in the pipeline). Marks the unit validated on success.
async function validateUnit(
  callApi: TextCallFn,
  format: FormatType,
  unitPages: GeneratedPage[],
  slices: PageSlice[],
  wordCountMax: number,
  onStatus: ((msg: string) => void) | undefined,
  voiceCard: string,
  progressCtx: ProgressCtx | undefined,
  unitKey: string,
): Promise<GeneratedPage[]> {
  if (progressCtx) {
    const prior = await loadProgress(progressCtx.bookId, progressCtx.format);
    if (prior?.validatedUnits?.[unitKey]) {
      return unitPages;
    }
  }
  try {
    const result = await validateAndRepair(callApi, format, unitPages, slices, wordCountMax, onStatus, voiceCard);
    if (progressCtx) await markUnitValidated(progressCtx, unitKey);
    return result;
  } catch (e) {
    console.warn(`[geminiAdmin] per-unit validate failed (${unitKey}); continuing`, e);
    onStatus?.(`Validator skipped for ${unitKey} (continuing).`);
    return unitPages;
  }
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

async function buildVoiceCard(ocrPages: OcrPage[], callApi: TextCallFn, onStatus?: (msg: string) => void, progressCtx?: ProgressCtx): Promise<string> {
  if (ocrPages.length === 0) return '';
  const pick = (idx: number) => ocrPages[Math.max(0, Math.min(ocrPages.length - 1, idx))]?.text || '';
  const sampleA = pick(Math.floor(ocrPages.length * 0.1));
  const sampleB = pick(Math.floor(ocrPages.length * 0.5));
  const sampleC = pick(Math.floor(ocrPages.length * 0.9));
  onStatus?.('Extracting voice card...');
  const raw = stripWrapping(await callWithRetry(() => callApi(buildVoiceCardPrompt(sampleA, sampleB, sampleC), { temperature: 0.3 }), onStatus));
  const card = (extractBlock(raw, 'VOICE') || '').trim();
  if (progressCtx) await saveProgress(progressCtx, { voiceCard: card, lastCompletedPhase: 'voiceCard' });
  return card;
}

function voiceCardBlock(card: string): string {
  if (!card) return '';
  return `\n\nAUTHOR VOICE CARD — match this exactly:\n${card}\n`;
}

// Type retained for shared use by per-page + classic-batch slice helpers.
// Allocations themselves are no longer produced (semantic chunking removed).
interface AllocatedChunk {
  pdfStart: number;
  pdfEnd: number;
  outStart: number;
  outEnd: number;
  outCount: number;
  label?: string;
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
  progressCtx?: ProgressCtx,
  resumeFrom?: { startIdx: number; existingPages: GeneratedPage[] },
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

  const startIdx = resumeFrom?.startIdx ?? 0;
  const pages: GeneratedPage[] = resumeFrom?.existingPages ? [...resumeFrom.existingPages] : [];
  for (let i = startIdx; i < tasks.length; i++) {
    const t = tasks[i];
    onStatus?.(`Per-page ${i + 1}/${tasks.length} — page ${t.outPage} (PDF ${t.pdfStart}-${t.pdfEnd})...`);
    const prompt = buildSinglePagePrompt(format, t.outPage, totalOutputPages, t.pdfStart, t.pdfEnd, t.sliceText, voiceCard, t.label);
    const parsed = await callWithRetry(() => callAndParse(callApi, prompt), onStatus);
    const content = typeof parsed?.content === 'string' ? parsed.content.trim() : '';
    if (!content) throw new Error(`Per-page generation returned empty content for page ${t.outPage}`);
    pages.push({ pageNumber: t.outPage, content });
    if (progressCtx) {
      await saveProgress(progressCtx, {
        rawPages: pages,
        lastCompletedPhase: 'perPageGen',
        lastCompletedIndex: i,
      });
    }
  }
  return pages;
}

async function smoothPages(
  format: FormatType,
  pages: GeneratedPage[],
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
  progressCtx?: ProgressCtx,
  resumeChunkIdx: number = 0,
): Promise<GeneratedPage[]> {
  if (pages.length === 0) return pages;
  const result = pages.map((p) => ({ ...p }));
  const chunkSize = SMOOTHING_CHUNK_SIZE;
  const totalChunks = Math.ceil(result.length / chunkSize);

  for (let ci = resumeChunkIdx; ci < totalChunks; ci++) {
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
    if (progressCtx) {
      await saveProgress(progressCtx, {
        smoothedPages: result,
        lastCompletedPhase: 'smooth',
        lastCompletedIndex: ci,
      });
    }
  }
  return result;
}

// Per-chapter smoothing — one smoothing call per chapter's output-page slice.
// Reuses buildSmoothingPrompt (same neighbor convention). Each chapter is one "chunk".
// resumeChunkIdx skips already-completed chapters.
async function smoothPagesByChapters(
  format: FormatType,
  pages: GeneratedPage[],
  chapterRanges: { outStart: number; outEnd: number; label?: string }[],
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
  progressCtx?: ProgressCtx,
  resumeChunkIdx: number = 0,
): Promise<GeneratedPage[]> {
  if (pages.length === 0 || chapterRanges.length === 0) return pages;
  const result = pages.map((p) => ({ ...p }));
  // Build position index by pageNumber for O(1) lookup.
  const posByPage = new Map<number, number>();
  result.forEach((p, i) => posByPage.set(p.pageNumber, i));

  const totalChunks = chapterRanges.length;
  for (let ci = resumeChunkIdx; ci < totalChunks; ci++) {
    const range = chapterRanges[ci];
    // Collect indices of result pages whose pageNumber falls in [outStart, outEnd].
    const idxs: number[] = [];
    for (let pn = range.outStart; pn <= range.outEnd; pn++) {
      const idx = posByPage.get(pn);
      if (idx !== undefined) idxs.push(idx);
    }
    if (idxs.length === 0) continue;

    const startIdx = idxs[0];
    const endIdxExclusive = idxs[idxs.length - 1] + 1;
    const chunkPages = idxs.map((i) => result[i]);
    const prev = startIdx > 0 ? result[startIdx - 1] : null;
    const next = endIdxExclusive < result.length ? result[endIdxExclusive] : null;

    const labelPart = range.label ? ` "${range.label}"` : '';
    onStatus?.(`Smoothing chapter ${ci + 1}/${totalChunks}${labelPart} (pages ${chunkPages[0].pageNumber}-${chunkPages[chunkPages.length - 1].pageNumber})...`);

    const prompt = buildSmoothingPrompt(format, chunkPages, prev, next, voiceCard);
    const raw = stripWrapping(await callWithRetry(() => callApi(prompt, { temperature: 0.5 }), onStatus));

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
        result[idxs[i]] = { ...result[idxs[i]], content: smoothed };
      } else {
        console.warn(`Chapter smoothing skipped page ${p.pageNumber} — no block found`);
      }
    }
    if (progressCtx) {
      await saveProgress(progressCtx, {
        smoothedPages: result,
        lastCompletedPhase: 'smooth',
        lastCompletedIndex: ci,
      });
    }
  }
  return result;
}

// For wordCount path: chapters → output ranges using actual per-source-page allocations.
// Each chapter spans a set of source pages, each source page has a known outCount.
// Sum allocations for chapter's source pages → chapter's output page count.
function mapChaptersToOutputRangesByAllocations(
  chapters: ChapterRange[],
  allocations: { sourcePage: number; outCount: number }[],
): { outStart: number; outEnd: number; label?: string }[] {
  const ranges: { outStart: number; outEnd: number; label?: string }[] = [];
  let cursor = 1;
  // Build a quick lookup.
  const allocByPage = new Map<number, number>();
  for (const a of allocations) allocByPage.set(a.sourcePage, a.outCount);
  for (const c of chapters) {
    let cnt = 0;
    for (let p = c.startPage; p <= c.endPage; p++) {
      cnt += allocByPage.get(p) || 0;
    }
    if (cnt <= 0) continue;
    ranges.push({ outStart: cursor, outEnd: cursor + cnt - 1, label: c.label });
    cursor += cnt;
  }
  // Defensive clamp: if last chapter's outEnd doesn't match total, extend.
  const totalOut = allocations.reduce((s, a) => s + a.outCount, 0);
  if (ranges.length > 0 && ranges[ranges.length - 1].outEnd !== totalOut) {
    ranges[ranges.length - 1].outEnd = totalOut;
  }
  return ranges;
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

// ---------- Strategy 6: Word-Count Page Allocation ----------

interface BodyRange {
  startPage: number;
  endPage: number;
  startLabel?: string;
  endLabel?: string;
}

function buildBodyTrimPrompt(ocrPages: OcrPage[]): string {
  const formatPreview = (p: OcrPage) => `P${p.pageNum}: ${p.text.substring(0, 200).replace(/\s+/g, ' ')}`;
  let previews: string;
  if (ocrPages.length > TRIM_PREVIEW_EDGE_THRESHOLD) {
    const head = ocrPages.slice(0, TRIM_PREVIEW_EDGE_SIZE);
    const tail = ocrPages.slice(ocrPages.length - TRIM_PREVIEW_EDGE_SIZE);
    const gapStart = head[head.length - 1].pageNum + 1;
    const gapEnd = tail[0].pageNum - 1;
    previews = [
      ...head.map(formatPreview),
      `[... pages ${gapStart}-${gapEnd} skipped (front/back matter is at edges) ...]`,
      ...tail.map(formatPreview),
    ].join('\n');
  } else {
    previews = ocrPages.map(formatPreview).join('\n');
  }
  const last = ocrPages.length > 0 ? ocrPages[ocrPages.length - 1].pageNum : 1;
  const first = ocrPages.length > 0 ? ocrPages[0].pageNum : 1;
  return `You are a book structure analyst. Identify the boundaries of the actual book content (the body) — i.e. skip front matter and back matter.

FRONT MATTER to skip: cover, copyright, dedication, table of contents, list of figures, acknowledgments, blurbs.
BODY starts at the FIRST of: preface, foreword, introduction, prologue, chapter 1 — whichever comes first.
BODY ends at the LAST of: last chapter, epilogue, afterword — before any index, bibliography, references, glossary, notes, about-the-author, ads.

Use this EXACT text format. No JSON, no code fences, no text outside markers. Page numbers must be integers between ${first} and ${last}.

<<<START>>>
page: <integer>
label: <short label, e.g. "preface" or "chapter 1">
<<<END START>>>

<<<END_RANGE>>>
page: <integer>
label: <short label, e.g. "epilogue" or "chapter 24">
<<<END END_RANGE>>>

--- PAGE PREVIEWS ---
${previews}`;
}

function extractBodyRange(raw: string, fallbackStart: number, fallbackEnd: number): BodyRange {
  const startBlock = extractBlock(raw, 'START') || '';
  const endBlock = extractBlock(raw, 'END_RANGE') || '';
  const startPage = parseInt(startBlock.match(/page\s*:\s*(\d+)/i)?.[1] || '0', 10);
  const endPage = parseInt(endBlock.match(/page\s*:\s*(\d+)/i)?.[1] || '0', 10);
  const startLabel = (startBlock.match(/label\s*:\s*([^\n]+)/i)?.[1] || '').trim();
  const endLabel = (endBlock.match(/label\s*:\s*([^\n]+)/i)?.[1] || '').trim();

  // Validate — require sane integers within bounds and start <= end.
  const validStart = startPage >= fallbackStart && startPage <= fallbackEnd;
  const validEnd = endPage >= fallbackStart && endPage <= fallbackEnd && endPage >= startPage;
  if (!validStart || !validEnd) {
    return { startPage: fallbackStart, endPage: fallbackEnd };
  }
  return { startPage, endPage, startLabel, endLabel };
}

async function detectBodyRange(
  ocrPages: OcrPage[],
  callApi: TextCallFn,
  onStatus?: (msg: string) => void,
): Promise<BodyRange> {
  if (ocrPages.length === 0) return { startPage: 1, endPage: 1 };
  const first = ocrPages[0].pageNum;
  const last = ocrPages[ocrPages.length - 1].pageNum;
  onStatus?.('Trim: detecting front/back matter...');
  try {
    const raw = stripWrapping(await callApi(buildBodyTrimPrompt(ocrPages), { temperature: 0.2 }));
    return extractBodyRange(raw, first, last);
  } catch (e) {
    console.warn('Body-range detection failed, using full range', e);
    onStatus?.('Trim: detection failed, using full range.');
    return { startPage: first, endPage: last };
  }
}

// ---------- Chapter detection (classic batch path) ----------

interface ChapterRange {
  startPage: number; // PDF page
  endPage: number;   // PDF page
  label?: string;
}

interface ChapterBatch {
  startPage: number; // PDF
  endPage: number;   // PDF
  outStart: number;  // output page
  outEnd: number;    // output page
  label?: string;
}

function buildChapterDetectionPrompt(ocrPages: OcrPage[], range: BodyRange): string {
  // Restrict previews to body range only.
  const body = ocrPages.filter((p) => p.pageNum >= range.startPage && p.pageNum <= range.endPage);
  const formatPreview = (p: OcrPage) => `P${p.pageNum}: ${p.text.substring(0, 200).replace(/\s+/g, ' ')}`;
  let previews: string;
  if (body.length > TRIM_PREVIEW_EDGE_THRESHOLD) {
    // Sample evenly across the body — chapter starts can appear anywhere.
    const step = Math.ceil(body.length / TRIM_PREVIEW_EDGE_THRESHOLD);
    const sampled: OcrPage[] = [];
    for (let i = 0; i < body.length; i += step) sampled.push(body[i]);
    if (sampled[sampled.length - 1] !== body[body.length - 1]) sampled.push(body[body.length - 1]);
    previews = sampled.map(formatPreview).join('\n');
  } else {
    previews = body.map(formatPreview).join('\n');
  }
  return `You are a book structure analyst. Identify the CHAPTER boundaries within the body range below. The body starts at page ${range.startPage} and ends at page ${range.endPage}.

A chapter is any major top-level division of the book — Chapter 1, Chapter 2, etc., or named sections like "Part I: The Beginning", "Prologue", "Epilogue". Treat preface/foreword/introduction/prologue/epilogue/afterword as chapters too, when present.

Rules:
- Chapters must be contiguous and cover the ENTIRE range ${range.startPage}-${range.endPage} with no gaps and no overlaps.
- Each chapter's startPage and endPage must be integers within ${range.startPage}-${range.endPage}.
- The first chapter's startPage MUST equal ${range.startPage}. The last chapter's endPage MUST equal ${range.endPage}.
- If you cannot detect distinct chapters, emit a single chapter spanning the full range.

Use this EXACT text format. No JSON, no code fences, no text outside markers. One <<<CHAPTER N>>>...<<<END CHAPTER N>>> block per chapter, numbered from 1.

<<<CHAPTER 1>>>
startPage: <integer>
endPage: <integer>
label: <short label, e.g. "Chapter 1: The Awakening">
<<<END CHAPTER 1>>>

<<<CHAPTER 2>>>
startPage: <integer>
endPage: <integer>
label: <short label>
<<<END CHAPTER 2>>>

--- PAGE PREVIEWS (body only) ---
${previews}`;
}

function extractChapterRanges(raw: string, range: BodyRange): ChapterRange[] {
  const re = /<<<\s*CHAPTER\s+(\d+)\s*>>>([\s\S]*?)<<<\s*END\s+CHAPTER\s+\1\s*>>>/gi;
  const chapters: ChapterRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const body = m[2];
    const startPage = parseInt(body.match(/startPage\s*:\s*(\d+)/i)?.[1] || '0', 10);
    const endPage = parseInt(body.match(/endPage\s*:\s*(\d+)/i)?.[1] || '0', 10);
    const label = (body.match(/label\s*:\s*([^\n]+)/i)?.[1] || '').trim();
    if (startPage > 0 && endPage >= startPage) {
      chapters.push({ startPage, endPage, label: label || undefined });
    }
  }
  // Validate: every chapter inside body range, contiguous.
  const valid = chapters.every((c) => c.startPage >= range.startPage && c.endPage <= range.endPage);
  if (!valid || chapters.length === 0) return [];
  // Force first/last alignment + sort by startPage.
  chapters.sort((a, b) => a.startPage - b.startPage);
  // Repair small gaps/overlaps so coverage is complete.
  for (let i = 0; i < chapters.length - 1; i++) {
    if (chapters[i + 1].startPage !== chapters[i].endPage + 1) {
      chapters[i + 1].startPage = chapters[i].endPage + 1;
      if (chapters[i + 1].startPage > chapters[i + 1].endPage) {
        chapters[i + 1].endPage = chapters[i + 1].startPage;
      }
    }
  }
  chapters[0].startPage = range.startPage;
  chapters[chapters.length - 1].endPage = range.endPage;
  return chapters;
}

async function detectChapters(
  ocrPages: OcrPage[],
  range: BodyRange,
  callApi: TextCallFn,
  onStatus?: (msg: string) => void,
): Promise<ChapterRange[]> {
  if (ocrPages.length === 0) return [];
  onStatus?.('Detecting chapter boundaries...');
  try {
    const raw = stripWrapping(await callApi(buildChapterDetectionPrompt(ocrPages, range), { temperature: 0.2 }));
    return extractChapterRanges(raw, range);
  } catch (e) {
    console.warn('Chapter detection failed', e);
    onStatus?.('Chapter detection failed.');
    return [];
  }
}

// Map detected chapters to output-page ranges, proportional to PDF span.
// Guarantees: covers 1..expectedPages exactly, no gaps, totals add up.
function mapChaptersToOutputPages(
  chapters: ChapterRange[],
  expectedPages: number,
  bodyStart: number,
  bodyEnd: number,
): ChapterBatch[] {
  const bodySpan = bodyEnd - bodyStart + 1;
  if (chapters.length === 0 || bodySpan <= 0 || expectedPages <= 0) return [];

  // Guard: every chapter is forced to >=1 output page below, so chapters.length must
  // not exceed expectedPages. Merge tail chapters until count <= expectedPages.
  if (chapters.length > expectedPages) {
    const merged: ChapterRange[] = chapters.slice(0, expectedPages - 1);
    const tail = chapters.slice(expectedPages - 1);
    const combined: ChapterRange = {
      startPage: tail[0].startPage,
      endPage: tail[tail.length - 1].endPage,
      label: tail.map((c) => c.label).filter(Boolean).join(' + ') || undefined,
    };
    merged.push(combined);
    chapters = merged;
  }

  // First pass: floor each chapter's share, track remainders.
  const shares: { idx: number; raw: number; floor: number; remainder: number }[] = chapters.map((c, idx) => {
    const span = c.endPage - c.startPage + 1;
    const raw = (span / bodySpan) * expectedPages;
    const floor = Math.floor(raw);
    return { idx, raw, floor, remainder: raw - floor };
  });

  // Ensure each chapter gets at least 1 output page.
  let assigned = shares.reduce((s, x) => s + Math.max(1, x.floor), 0);
  const counts = shares.map((x) => Math.max(1, x.floor));

  // Distribute leftover (or trim overflow) using largest-remainder.
  let diff = expectedPages - assigned;
  if (diff > 0) {
    const order = [...shares].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < order.length && diff > 0; i++) { counts[order[i].idx]++; diff--; }
    // Wrap if still positive (rare).
    while (diff > 0) {
      for (let i = 0; i < counts.length && diff > 0; i++) { counts[i]++; diff--; }
    }
  } else if (diff < 0) {
    // Remove from chapters with smallest remainder, but never below 1.
    const order = [...shares].sort((a, b) => a.remainder - b.remainder);
    for (let i = 0; i < order.length && diff < 0; i++) {
      if (counts[order[i].idx] > 1) { counts[order[i].idx]--; diff++; }
    }
    while (diff < 0) {
      let progressed = false;
      for (let i = 0; i < counts.length && diff < 0; i++) {
        if (counts[i] > 1) { counts[i]--; diff++; progressed = true; }
      }
      if (!progressed) break; // can't shrink further (every chapter at 1)
    }
  }

  const batches: ChapterBatch[] = [];
  let cursor = 1;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const cnt = counts[i];
    if (cnt <= 0) continue;
    const outStart = cursor;
    const outEnd = cursor + cnt - 1;
    batches.push({ startPage: c.startPage, endPage: c.endPage, outStart, outEnd, label: c.label });
    cursor = outEnd + 1;
  }
  // Final clamp to expectedPages.
  if (batches.length > 0 && batches[batches.length - 1].outEnd !== expectedPages) {
    batches[batches.length - 1].outEnd = expectedPages;
  }
  return batches;
}

interface WordCountTask {
  outPage: number; // assigned later (sequential)
  sourcePage: number;
  outCount: number; // pages this source produces
  sliceText: string;
}

function allocateByWordCount(ocrPages: OcrPage[], range: BodyRange): { sourcePage: number; outCount: number; words: number }[] {
  const out: { sourcePage: number; outCount: number; words: number }[] = [];
  for (const p of ocrPages) {
    if (p.pageNum < range.startPage || p.pageNum > range.endPage) continue;
    const words = countWords(p.text);
    // Integer-mod path — avoids float subtraction (e.g. 336/240 frac landing at 0.39999... instead of 0.4).
    const remainder = words % WORD_COUNT_DIVISOR;
    const quotient = Math.floor(words / WORD_COUNT_DIVISOR);
    const frac = remainder / WORD_COUNT_DIVISOR;
    const rounded = frac < WORD_COUNT_ROUND_THRESHOLD ? quotient : quotient + 1;
    const outCount = Math.max(1, rounded); // body pages always produce at least 1 output
    out.push({ sourcePage: p.pageNum, outCount, words });
  }
  return out;
}

function buildWordCountSinglePagePrompt(
  format: FormatType,
  outPage: number,
  totalOutputPages: number,
  sourcePage: number,
  pagesToProduce: number,
  sliceText: string,
  voiceCard: string,
): string {
  const countDirective = pagesToProduce === 1
    ? `Produce EXACTLY ONE output page covering this source page.`
    : `Produce EXACTLY ${pagesToProduce} output pages covering this source page. Split the source content evenly across the ${pagesToProduce} pages — each must cover a distinct portion in reading order.`;

  const outNumbering = pagesToProduce === 1
    ? `<<<PAGE ${outPage}>>>\n(60-80 word content)\n<<<END PAGE ${outPage}>>>`
    : Array.from({ length: pagesToProduce }, (_, i) =>
        `<<<PAGE ${outPage + i}>>>\n(60-80 word content)\n<<<END PAGE ${outPage + i}>>>`,
      ).join('\n\n');

  return `You are a literary condensation engine. You are generating output ${pagesToProduce === 1 ? 'page' : `pages ${outPage}-${outPage + pagesToProduce - 1}`} of ${totalOutputPages} for a condensed book version (allocation derived from source word count).

This output corresponds to source PDF page ${sourcePage}. ${countDirective}

STRICT WORD COUNT: each output page MUST be 60-80 words.

${qualityRules(format)}${voiceCardBlock(voiceCard)}

Use this EXACT text format. No JSON, no code fences, no text outside markers.

${outNumbering}

--- SOURCE PAGE ${sourcePage} ---
${sliceText}`;
}

async function generateByWordCountAllocation(
  format: FormatType,
  ocrPages: OcrPage[],
  allocations: { sourcePage: number; outCount: number; words: number }[],
  callApi: TextCallFn,
  voiceCard: string,
  onStatus?: (msg: string) => void,
  progressCtx?: ProgressCtx,
  resumeFrom?: { startIdx: number; pages: GeneratedPage[]; sourceByOutput: Map<number, number> },
): Promise<{ pages: GeneratedPage[]; sourceByOutput: Map<number, number> }> {
  // Filter zero-allocation pages — they're skipped entirely.
  const active = allocations.filter((a) => a.outCount > 0);
  const totalOutputPages = active.reduce((s, a) => s + a.outCount, 0);
  if (totalOutputPages === 0) {
    throw new Error('Word-count allocation produced zero output pages');
  }

  const pages: GeneratedPage[] = resumeFrom?.pages ? [...resumeFrom.pages] : [];
  const sourceByOutput = resumeFrom?.sourceByOutput ? new Map(resumeFrom.sourceByOutput) : new Map<number, number>();
  let outCounter = pages.length;
  const startIdx = resumeFrom?.startIdx ?? 0;

  for (let i = startIdx; i < active.length; i++) {
    const a = active[i];
    const src = ocrPages.find((p) => p.pageNum === a.sourcePage);
    if (!src) continue;
    const sliceText = `Page ${src.pageNum} start\n${src.text}\nPage ${src.pageNum} end`;
    const startOut = outCounter + 1;

    onStatus?.(`Generating page ${i + 1}/${active.length} (source ${a.sourcePage}, ${a.words} words → ${a.outCount} pages)...`);

    const prompt = buildWordCountSinglePagePrompt(format, startOut, totalOutputPages, a.sourcePage, a.outCount, sliceText, voiceCard);
    const raw = stripWrapping(await callWithRetry(() => callApi(prompt, { temperature: 0.6 }), onStatus));
    let blocks = extractPageBlocks(raw);

    if (blocks.length === 0) {
      // Retry once with stricter prompt.
      onStatus?.(`Empty response for source ${a.sourcePage}; retrying...`);
      const stricter = prompt + `\n\nIMPORTANT: your previous response emitted zero pages. You MUST emit exactly ${a.outCount} <<<PAGE N>>> blocks.`;
      const raw2 = stripWrapping(await callWithRetry(() => callApi(stricter, { temperature: 0.6 }), onStatus));
      blocks = extractPageBlocks(raw2);
      if (blocks.length === 0) {
        console.warn(`Word-count gen returned zero pages for source ${a.sourcePage} after retry`);
        onStatus?.(`Warning: source page ${a.sourcePage} skipped — model returned zero pages after retry.`);
        continue;
      }
    }

    // Cap to allocation; pad missing if model under-produces.
    const capped = blocks.slice(0, a.outCount);
    for (const b of capped) {
      outCounter++;
      pages.push({ pageNumber: outCounter, content: b.content });
      sourceByOutput.set(outCounter, src.pageNum);
    }
    if (capped.length < a.outCount) {
      console.warn(`Word-count gen under-produced for source ${a.sourcePage}: got ${capped.length}/${a.outCount}`);
      onStatus?.(`Warning: source ${a.sourcePage} under-produced — got ${capped.length}/${a.outCount} pages.`);
    }
    if (progressCtx) {
      await saveProgress(progressCtx, {
        rawPages: pages,
        sourceByOutput: Array.from(sourceByOutput.entries()),
        lastCompletedPhase: 'wcGen',
        lastCompletedIndex: i,
      });
    }
  }

  return { pages, sourceByOutput };
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
  progressCtx?: ProgressCtx,
): Promise<GenerationResult> {
  try {
    return await _generateInBatchesInner(ocrPages, format, callApi, wordCountMax, onStatus, flags, progressCtx);
  } catch (err: any) {
    const reason = err?.message || String(err);
    if (progressCtx) {
      // Persist failure marker. Don't await failures from save itself.
      await saveProgress(progressCtx, { failedReason: reason });
    }
    throw err;
  }
}

async function _generateInBatchesInner(
  ocrPages: OcrPage[],
  format: FormatType,
  callApi: TextCallFn,
  wordCountMax: number,
  onStatus?: (msg: string) => void,
  flags: StrategyFlags = {},
  progressCtx?: ProgressCtx,
): Promise<GenerationResult> {
  const totalPdfPages = ocrPages.length;
  const expectedPages = computeExpectedPages(format, totalPdfPages);

  // perPageSmoothing/wordCountAllocation are Ultra-only. Strip them for Mini/Pro so they
  // run the classic single-shot/batch path. chapterDetection applies to ALL formats.
  if (format !== 'ultra') {
    flags = { chapterDetection: flags.chapterDetection };
  }

  // Resume hydration: load existing progress + check path/flag compat.
  let prior: ProgressState | null = null;
  if (progressCtx) {
    prior = await loadProgress(progressCtx.bookId, progressCtx.format);
    if (prior && !flagsCompatible(prior.flags, flags, format)) {
      // Path mismatch — silent reset.
      await clearProgress(progressCtx);
      prior = null;
    }
    const path = resolvePath(format, flags);
    // Initialize/refresh progress meta.
    await saveProgress(progressCtx, {
      schemaVersion: SCHEMA_VERSION,
      startedAt: prior?.startedAt || Date.now(),
      format: format as any,
      flags,
      path,
      ocrPages: prior?.ocrPages || ocrPages.map((p) => ({ pageNum: p.pageNum, text: p.text })),
    });
  }

  // Voice card — automatic first pass, runs in every gen path. Skipped for tiny inputs.
  let voiceCard = prior?.voiceCard || '';
  if (!voiceCard && ocrPages.length >= VOICE_CARD_MIN_PAGES) {
    try {
      voiceCard = await buildVoiceCard(ocrPages, callApi, onStatus, progressCtx);
      if (voiceCard) onStatus?.(`Voice card ready (${voiceCard.length} chars).`);
    } catch (e) {
      console.warn('Voice card generation failed, continuing without', e);
    }
  } else if (voiceCard) {
    onStatus?.(`Resuming with cached voice card (${voiceCard.length} chars).`);
  }

  // Strategy: Word-Count Page Allocation.
  // Owns full pipeline: LLM trim → host-side allocation → per-page gen → smoothing.
  // Mutually exclusive with perPageSmoothing (overrides format-size expectation).
  if (flags.wordCountAllocation) {
    // Phase 0 — front/back matter trim.
    let range = prior?.bodyRange;
    if (!range) {
      range = await detectBodyRange(ocrPages, callApi, onStatus);
      if (progressCtx) await saveProgress(progressCtx, { bodyRange: range, lastCompletedPhase: 'trim' });
    }
    const skippedFront = ocrPages.filter((p) => p.pageNum < range!.startPage).length;
    const skippedBack = ocrPages.filter((p) => p.pageNum > range!.endPage).length;
    const startLabel = range!.startLabel ? ` (${range!.startLabel})` : '';
    const endLabel = range!.endLabel ? ` (${range!.endLabel})` : '';
    onStatus?.(`Trim: starting at page ${range!.startPage}${startLabel}, ending at page ${range!.endPage}${endLabel}. Skipped ${skippedFront} front-matter + ${skippedBack} back-matter pages.`);

    // Phase 1 — word-count allocation (host-side).
    let allocations = prior?.allocations;
    if (!allocations) {
      allocations = allocateByWordCount(ocrPages, range!);
      if (progressCtx) await saveProgress(progressCtx, { allocations, lastCompletedPhase: 'allocate' });
    }
    const bodyCount = allocations.length;
    const outputCount = allocations.reduce((s, a) => s + a.outCount, 0);
    onStatus?.(`Word-count plan: ${outputCount} output pages from ${bodyCount} body source pages (range ${range!.startPage}-${range!.endPage}).`);

    if (outputCount === 0) {
      throw new Error('Word-count allocation produced zero output pages — body is too sparse.');
    }

    // Phase 1.5 — chapter detection (used by smoothing). Cached on progress.
    const useChapterDetectionWC = flags.chapterDetection !== false;
    let wcChapterBatches: ChapterBatch[] = prior?.chapters ?? [];
    if (useChapterDetectionWC && wcChapterBatches.length === 0) {
      const detected = await detectChapters(ocrPages, range!, callApi, onStatus);
      const usable =
        detected.length > 0 &&
        !(detected.length === 1 && outputCount > BATCH_SIZE * 2);
      if (usable) {
        const ranges = mapChaptersToOutputRangesByAllocations(detected, allocations);
        // Convert to ChapterBatch shape (PDF range from detected, output range computed).
        wcChapterBatches = detected.map((c, i) => ({
          startPage: c.startPage,
          endPage: c.endPage,
          outStart: ranges[i]?.outStart ?? 0,
          outEnd: ranges[i]?.outEnd ?? 0,
          label: c.label,
        })).filter((b) => b.outStart > 0 && b.outEnd >= b.outStart);
      }
      if (wcChapterBatches.length > 0 && progressCtx) {
        await saveProgress(progressCtx, { chapters: wcChapterBatches });
      } else if (wcChapterBatches.length === 0) {
        onStatus?.('Chapter detection failed — falling back to fixed chunks.');
        console.warn('[geminiAdmin] wordCount chapter detection unusable; smoothing will use fixed chunks');
      }
    }

    // Phase 2 — per-page generation honoring allocation. Resume mid-loop if applicable.
    const wcResumeFrom = prior?.lastCompletedPhase === 'wcGen' && prior.rawPages
      ? {
          startIdx: (prior.lastCompletedIndex ?? -1) + 1,
          pages: prior.rawPages,
          sourceByOutput: new Map(prior.sourceByOutput || []),
        }
      : undefined;
    const { pages: rawPages, sourceByOutput } = await generateByWordCountAllocation(
      format, ocrPages, allocations, callApi, voiceCard, onStatus, progressCtx, wcResumeFrom,
    );
    if (rawPages.length === 0) {
      throw new Error('Word-count generation produced zero pages');
    }

    // Metadata pass.
    let title = prior?.meta?.title || '';
    let author = prior?.meta?.author || '';
    let summary = prior?.meta?.summary || '';
    if (!prior?.meta) {
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
        if (progressCtx) await saveProgress(progressCtx, { meta: { title, author, summary }, lastCompletedPhase: 'meta' });
      } catch (e) {
        console.warn('Metadata extraction failed', e);
      }
    }

    // Phase 3 — smoothing. Per-chapter when chapter detection produced ranges, else fixed chunks.
    onStatus?.('Smoothing pass...');
    const smoothResume = prior?.lastCompletedPhase === 'smooth' && prior.smoothedPages
      ? { pages: prior.smoothedPages, fromIdx: (prior.lastCompletedIndex ?? -1) + 1 }
      : null;
    const wcSmoothInput = smoothResume ? smoothResume.pages : rawPages;
    const wcSmoothFrom = smoothResume ? smoothResume.fromIdx : 0;
    let pages: GeneratedPage[];
    if (useChapterDetectionWC && wcChapterBatches.length > 0) {
      const wcRanges = wcChapterBatches.map((c) => ({ outStart: c.outStart, outEnd: c.outEnd, label: c.label }));
      pages = await smoothPagesByChapters(format, wcSmoothInput, wcRanges, callApi, voiceCard, onStatus, progressCtx, wcSmoothFrom);
    } else {
      pages = await smoothPages(format, wcSmoothInput, callApi, voiceCard, onStatus, progressCtx, wcSmoothFrom);
    }

    // Validator uses source-map slicing per output page. Chunked + memoized per unit.
    const slices = computePageSlicesFromSourceMap(ocrPages, pages, sourceByOutput);
    onStatus?.('Validating pages against source...');
    {
      const units = useChapterDetectionWC && wcChapterBatches.length > 0
        ? wcChapterBatches.map((c, i) => ({ key: `validate:wc:${i}`, outStart: c.outStart, outEnd: c.outEnd }))
        : (() => {
            const out: { key: string; outStart: number; outEnd: number }[] = [];
            for (let i = 0; i < pages.length; i += SMOOTHING_CHUNK_SIZE) {
              out.push({ key: `validate:wc:${i / SMOOTHING_CHUNK_SIZE}`, outStart: pages[i].pageNumber, outEnd: pages[Math.min(i + SMOOTHING_CHUNK_SIZE - 1, pages.length - 1)].pageNumber });
            }
            return out;
          })();
      const merged: GeneratedPage[] = [];
      for (const u of units) {
        const subset = pages.filter((p) => p.pageNumber >= u.outStart && p.pageNumber <= u.outEnd);
        const subSlices = slices.filter((s) => s.pageNumber >= u.outStart && s.pageNumber <= u.outEnd);
        const validated = await validateUnit(callApi, format, subset, subSlices, wordCountMax, onStatus, voiceCard, progressCtx, u.key);
        merged.push(...validated);
      }
      // Preserve any pages outside unit ranges unchanged.
      const covered = new Set(merged.map((p) => p.pageNumber));
      for (const p of pages) if (!covered.has(p.pageNumber)) merged.push(p);
      merged.sort((a, b) => a.pageNumber - b.pageNumber);
      pages = merged;
      if (progressCtx) await saveProgress(progressCtx, { validatedPages: pages, lastCompletedPhase: 'validate' });
    }

    if (progressCtx) await saveProgress(progressCtx, { lastCompletedPhase: 'done' });
    return { title, author, summary, pages };
  }

  // Semantic chunking removed — allocations always null for the classic/per-page paths.
  const allocations: AllocatedChunk[] | null = null;

  // Strategy 3: Per-Page Generation + Chunked Smoothing path.
  if (flags.perPageSmoothing) {
    const useChapterDetectionPP = flags.chapterDetection !== false;
    // Detect chapters up-front so smoothing can run per-chapter. Cache to progress.
    let ppChapterBatches: ChapterBatch[] = prior?.chapters ?? [];
    if (useChapterDetectionPP && ppChapterBatches.length === 0) {
      // Trim body first so chapter detection skips front/back matter (TOC, copyright, index, etc.)
      // Otherwise those get treated as chapters and rob output budget from real body chapters.
      let ppBodyRange: BodyRange;
      if (prior?.bodyRange) {
        ppBodyRange = prior.bodyRange;
      } else {
        ppBodyRange = await detectBodyRange(ocrPages, callApi, onStatus);
        if (progressCtx) await saveProgress(progressCtx, { bodyRange: ppBodyRange });
      }
      const detected = await detectChapters(ocrPages, ppBodyRange, callApi, onStatus);
      const usable =
        detected.length > 0 &&
        !(detected.length === 1 && expectedPages > BATCH_SIZE * 2);
      if (usable) {
        ppChapterBatches = mapChaptersToOutputPages(detected, expectedPages, ppBodyRange.startPage, ppBodyRange.endPage);
      }
      if (ppChapterBatches.length > 0 && progressCtx) {
        await saveProgress(progressCtx, { chapters: ppChapterBatches });
      } else if (ppChapterBatches.length === 0) {
        onStatus?.('Chapter detection failed — falling back to fixed chunks.');
        console.warn('[geminiAdmin] perPage chapter detection unusable; smoothing will use fixed chunks');
      }
    }

    const ppResume = prior?.lastCompletedPhase === 'perPageGen' && prior.rawPages
      ? { startIdx: (prior.lastCompletedIndex ?? -1) + 1, existingPages: prior.rawPages }
      : undefined;
    let pages = await generatePerPage(format, ocrPages, allocations, expectedPages, callApi, voiceCard, onStatus, progressCtx, ppResume);

    // Extract title/author/summary — piggyback on voice card sample OR do a dedicated pass.
    let title = prior?.meta?.title || '';
    let author = prior?.meta?.author || '';
    let summary = prior?.meta?.summary || '';
    if (!prior?.meta) {
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
        if (progressCtx) await saveProgress(progressCtx, { meta: { title, author, summary }, lastCompletedPhase: 'meta' });
      } catch (e) {
        console.warn('Metadata extraction failed', e);
      }
    }

    // Smoothing pass — per-chapter when chapter detection produced ranges, else fixed chunks.
    onStatus?.('Smoothing pass...');
    const smoothResume = prior?.lastCompletedPhase === 'smooth' && prior.smoothedPages
      ? { pages: prior.smoothedPages, fromIdx: (prior.lastCompletedIndex ?? -1) + 1 }
      : null;
    const ppSmoothInput = smoothResume ? smoothResume.pages : pages;
    const ppSmoothFrom = smoothResume ? smoothResume.fromIdx : 0;
    if (useChapterDetectionPP && ppChapterBatches.length > 0) {
      const ranges = ppChapterBatches.map((c) => ({ outStart: c.outStart, outEnd: c.outEnd, label: c.label }));
      pages = await smoothPagesByChapters(format, ppSmoothInput, ranges, callApi, voiceCard, onStatus, progressCtx, ppSmoothFrom);
    } else {
      pages = await smoothPages(format, ppSmoothInput, callApi, voiceCard, onStatus, progressCtx, ppSmoothFrom);
    }

    // Validator still runs (word-cap + fabrication check). Chunked + memoized per unit.
    const slices = computePageSlicesFromAllocations(ocrPages, pages, allocations, expectedPages, totalPdfPages);
    onStatus?.('Validating pages against source...');
    {
      const units = useChapterDetectionPP && ppChapterBatches.length > 0
        ? ppChapterBatches.map((c, i) => ({ key: `validate:pp:${i}`, outStart: c.outStart, outEnd: c.outEnd }))
        : (() => {
            const out: { key: string; outStart: number; outEnd: number }[] = [];
            for (let i = 0; i < pages.length; i += SMOOTHING_CHUNK_SIZE) {
              out.push({ key: `validate:pp:${i / SMOOTHING_CHUNK_SIZE}`, outStart: pages[i].pageNumber, outEnd: pages[Math.min(i + SMOOTHING_CHUNK_SIZE - 1, pages.length - 1)].pageNumber });
            }
            return out;
          })();
      const merged: GeneratedPage[] = [];
      for (const u of units) {
        const subset = pages.filter((p) => p.pageNumber >= u.outStart && p.pageNumber <= u.outEnd);
        const subSlices = slices.filter((s) => s.pageNumber >= u.outStart && s.pageNumber <= u.outEnd);
        const validated = await validateUnit(callApi, format, subset, subSlices, wordCountMax, onStatus, voiceCard, progressCtx, u.key);
        merged.push(...validated);
      }
      const covered = new Set(merged.map((p) => p.pageNumber));
      for (const p of pages) if (!covered.has(p.pageNumber)) merged.push(p);
      merged.sort((a, b) => a.pageNumber - b.pageNumber);
      pages = merged;
      if (progressCtx) await saveProgress(progressCtx, { validatedPages: pages, lastCompletedPhase: 'validate' });
    }

    if (progressCtx) await saveProgress(progressCtx, { lastCompletedPhase: 'done' });
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
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard, progressCtx);

    if (progressCtx) await saveProgress(progressCtx, { lastCompletedPhase: 'done' });
    return {
      title: parsed.title || '',
      author: parsed.author || '',
      summary: parsed.summary || '',
      pages,
    };
  }

  // Batch mode — chapter-based batching (one batch per detected chapter) when toggle ON.
  // When OFF, use legacy fixed-20 batching over the full PDF (no body trim).
  const useChapterDetection = flags.chapterDetection !== false; // default true
  let chapterBatches: ChapterBatch[] = prior?.chapters ?? [];

  if (useChapterDetection) {
    // Step 1: pick body range. Reuse prior if present (e.g. resumed run); otherwise run
    // body-trim detection so chapter detection sees only body (skips front/back matter).
    let bodyForChapters: BodyRange;
    if (prior?.bodyRange) {
      bodyForChapters = prior.bodyRange;
    } else {
      bodyForChapters = await detectBodyRange(ocrPages, callApi, onStatus);
      if (progressCtx) await saveProgress(progressCtx, { bodyRange: bodyForChapters });
    }

    // Step 2: chapter detection (or reuse from prior progress).
    if (chapterBatches.length === 0) {
      const detected = await detectChapters(ocrPages, bodyForChapters, callApi, onStatus);
      // Sanity guards — fall back to fixed-20 batching if detection is unusable.
      const usable =
        detected.length > 0 &&
        // Reject single-chapter result for very long books — defeats the point of batching.
        !(detected.length === 1 && expectedPages > BATCH_SIZE * 2);
      if (usable) {
        chapterBatches = mapChaptersToOutputPages(detected, expectedPages, bodyForChapters.startPage, bodyForChapters.endPage);
      }
      if (chapterBatches.length === 0) {
        console.warn('[geminiAdmin] chapter detection unusable; falling back to fixed-20 batching');
        onStatus?.('Chapter detection failed — falling back to fixed chunks.');
        // Build legacy fixed-batch ChapterBatch list so the rest of the loop is uniform.
        // Map output pages proportionally over the detected body range, not the full PDF.
        const bodySpan = bodyForChapters.endPage - bodyForChapters.startPage + 1;
        for (let i = 0; i < expectedPages; i += BATCH_SIZE) {
          const outStart = i + 1;
          const outEnd = Math.min(i + BATCH_SIZE, expectedPages);
          const pdfStart = bodyForChapters.startPage + Math.floor(((outStart - 1) / expectedPages) * bodySpan);
          const pdfEnd = Math.min(
            bodyForChapters.startPage + Math.floor((outEnd / expectedPages) * bodySpan) - 1,
            bodyForChapters.endPage,
          );
          chapterBatches.push({ startPage: pdfStart, endPage: Math.max(pdfStart, pdfEnd), outStart, outEnd });
        }
      }
      if (progressCtx) await saveProgress(progressCtx, { chapters: chapterBatches });
    }
  } else if (chapterBatches.length === 0) {
    // Legacy fixed-20 batching over full PDF — no body trim, no chapter detection.
    for (let i = 0; i < expectedPages; i += BATCH_SIZE) {
      const outStart = i + 1;
      const outEnd = Math.min(i + BATCH_SIZE, expectedPages);
      const pdfStart = 1 + Math.floor(((outStart - 1) / expectedPages) * totalPdfPages);
      const pdfEnd = Math.min(Math.floor((outEnd / expectedPages) * totalPdfPages), totalPdfPages);
      chapterBatches.push({ startPage: pdfStart, endPage: Math.max(pdfStart, pdfEnd), outStart, outEnd });
    }
    if (progressCtx) await saveProgress(progressCtx, { chapters: chapterBatches });
  }

  let title = prior?.meta?.title || '';
  let author = prior?.meta?.author || '';
  let summary = prior?.meta?.summary || '';

  // Resume support — only valid if prior batch count matches current chapterBatches length.
  // If a prior run used fixed-20 batching (different count), invalidate resume.
  const priorCanResume =
    prior?.lastCompletedPhase === 'batchGen' &&
    prior?.rawPages &&
    Array.isArray(prior.chapters) &&
    prior.chapters.length === chapterBatches.length;
  const startBatchIdx = priorCanResume ? (prior!.lastCompletedIndex ?? -1) + 1 : 0;
  if (!priorCanResume && prior?.lastCompletedPhase === 'batchGen') {
    console.warn('[geminiAdmin] prior batch progress incompatible with chapter batching; restarting');
  }
  const allPages: GeneratedPage[] = startBatchIdx > 0 && prior?.rawPages ? [...prior.rawPages] : [];

  for (let b = startBatchIdx; b < chapterBatches.length; b++) {
    const ch = chapterBatches[b];
    const startPage = ch.outStart;
    const endPage = ch.outEnd;
    const count = endPage - startPage + 1;
    const pdfStart = ch.startPage;
    const pdfEnd = ch.endPage;
    const labelPart = ch.label ? ` "${ch.label}"` : '';

    const chunkPages = ocrPages.filter((p) => p.pageNum >= pdfStart && p.pageNum <= pdfEnd);
    const text = chunkPages.map((p) => `Page ${p.pageNum} start\n${p.text}\nPage ${p.pageNum} end`).join('\n\n');

    onStatus?.(`Chapter ${b + 1}/${chapterBatches.length}${labelPart} — generating output pages ${startPage}-${endPage} (PDF pages ${pdfStart}-${pdfEnd})...`);

    const prompt = buildBatchPrompt(
      format, b, chapterBatches.length,
      startPage, endPage, count,
      expectedPages, pdfStart, pdfEnd, totalPdfPages,
      text, voiceCard, ch.label,
    );

    const parsed = await callWithRetry(() => callAndParse(callApi, prompt), onStatus);

    if (b === 0) {
      title = parsed.title || title;
      author = parsed.author || author;
      summary = parsed.summary || summary;
      if (progressCtx) await saveProgress(progressCtx, { meta: { title, author, summary } });
    }

    if (!Array.isArray(parsed?.pages) || parsed.pages.length === 0) {
      throw new Error(`Chapter ${b + 1}/${chapterBatches.length} (pages ${startPage}-${endPage}) returned no pages`);
    }

    let pages: GeneratedPage[] = parsed.pages.slice(0, count).map((p: any, i: number) => ({
      pageNumber: p.pageNumber ?? startPage + i,
      content: p.content || p.summary || '',
    }));

    const emptyCount = pages.filter((p) => !p.content.trim()).length;
    if (emptyCount === pages.length) {
      throw new Error(`Chapter ${b + 1}/${chapterBatches.length} (pages ${startPage}-${endPage}) returned empty content for all pages`);
    }

    onStatus?.(`Validating chapter ${b + 1}/${chapterBatches.length}${labelPart}...`);
    const slices = computePageSlices(ocrPages, pages, pdfStart, pdfEnd);
    pages = await validateUnit(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard, progressCtx, `batchGen:${b}`);

    allPages.push(...pages);

    if (progressCtx) {
      await saveProgress(progressCtx, {
        rawPages: allPages,
        lastCompletedPhase: 'batchGen',
        lastCompletedIndex: b,
      });
    }
  }

  if (allPages.length === 0) {
    throw new Error('Generation produced no pages across all batches');
  }

  const finalPages = allPages.slice(0, expectedPages);

  if (progressCtx) await saveProgress(progressCtx, { lastCompletedPhase: 'done' });
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
  bookId?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');

  const progressCtx: ProgressCtx | undefined = bookId ? { bookId, format } : undefined;

  // Try to reuse cached OCR.
  let ocrPages: OcrPage[] | null = null;
  if (progressCtx) {
    const prior = await loadProgress(progressCtx.bookId, progressCtx.format);
    if (prior?.ocrPages && prior.ocrPages.length > 0 && (!prior.flags || flagsCompatible(prior.flags, flags, format))) {
      ocrPages = prior.ocrPages.map((p) => ({ pageNum: p.pageNum, text: p.text }));
      onStatus?.(`Resuming with cached OCR (${ocrPages.length} pages).`);
    }
  }
  if (!ocrPages) {
    onStatus?.('Extracting text from PDF...');
    const ocrText = await ocrPdf(fileUri);
    ocrPages = parseOcrPages(ocrText);
    if (ocrPages.length === 0) throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');
  }

  const totalPages = ocrPages.length;
  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages extracted → generating ${expected} ${formatLabel(format)} pages...`);

  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), wordCountMax, onStatus, flags, progressCtx);
}

export async function generateFormatFromPdfOpenRouter(
  fileUri: string,
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
  bookId?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');

  const useModel = model || OPENROUTER_MODEL;
  const progressCtx: ProgressCtx | undefined = bookId ? { bookId, format } : undefined;

  let ocrPages: OcrPage[] | null = null;
  if (progressCtx) {
    const prior = await loadProgress(progressCtx.bookId, progressCtx.format);
    if (prior?.ocrPages && prior.ocrPages.length > 0 && (!prior.flags || flagsCompatible(prior.flags, flags, format))) {
      ocrPages = prior.ocrPages.map((p) => ({ pageNum: p.pageNum, text: p.text }));
      onStatus?.(`Resuming with cached OCR (${ocrPages.length} pages).`);
    }
  }
  if (!ocrPages) {
    onStatus?.('Extracting text from PDF...');
    const ocrText = await ocrPdf(fileUri);
    ocrPages = parseOcrPages(ocrText);
    if (ocrPages.length === 0) throw new Error('OCR returned no pages. The PDF may be empty or unreadable.');
  }

  const totalPages = ocrPages.length;
  const expected = computeExpectedPages(format, totalPages);
  onStatus?.(`${totalPages} pages extracted → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), wordCountMax, onStatus, flags, progressCtx);
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
  bookId?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('Gemini API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages...`);

  const progressCtx: ProgressCtx | undefined = bookId ? { bookId, format } : undefined;
  return generateInBatches(ocrPages, format, makeGeminiCall(apiKey), wordCountMax, onStatus, flags, progressCtx);
}

export async function generateFormatFromFullOpenRouter(
  fullPages: { pageNumber: number; content: string }[],
  apiKey: string,
  format: FormatType,
  onStatus?: (msg: string) => void,
  model?: string,
  wordCountMax: number = DEFAULT_WORD_COUNT_MAX,
  flags: StrategyFlags = {},
  bookId?: string,
): Promise<GenerationResult> {
  if (!apiKey) throw new Error('OpenRouter API key not available');
  if (format === 'ultra') throw new Error('Cannot generate Full from Full');
  if (!fullPages?.length) throw new Error('Full version has no pages');

  const useModel = model || OPENROUTER_MODEL;
  const ocrPages = fullPagesToOcr(fullPages);
  const expected = computeExpectedPages(format, ocrPages.length);
  onStatus?.(`Using Full (${ocrPages.length} pages) → generating ${expected} ${formatLabel(format)} pages via OpenRouter (${useModel})...`);

  const progressCtx: ProgressCtx | undefined = bookId ? { bookId, format } : undefined;
  return generateInBatches(ocrPages, format, makeOpenRouterCall(apiKey, useModel), wordCountMax, onStatus, flags, progressCtx);
}
