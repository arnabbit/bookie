import { ocrPdf } from './openrouter';
import {
  saveProgress,
  loadProgress,
  clearProgress,
  resolvePath,
  flagsCompatible,
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
}

// Voice card extraction is skipped for very small inputs — cost/benefit isn't worth it.
const VOICE_CARD_MIN_PAGES = 3;

type FormatType = 'mini' | 'pro' | 'ultra';

// Tuning — chosen defaults per admin-plans.md open Q's.
const SMOOTHING_CHUNK_SIZE = 5;
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

  // All processing strategies are Ultra-only. Strip flags entirely for Mini/Pro so they
  // run the classic single-shot/batch path regardless of stored toggle state.
  if (format !== 'ultra') {
    flags = {};
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

    // Phase 3 — smoothing (reuse existing). Resume from chunk if applicable.
    onStatus?.('Smoothing pass...');
    const smoothResume = prior?.lastCompletedPhase === 'smooth' && prior.smoothedPages
      ? { pages: prior.smoothedPages, fromIdx: (prior.lastCompletedIndex ?? -1) + 1 }
      : null;
    let pages = smoothResume
      ? await smoothPages(format, smoothResume.pages, callApi, voiceCard, onStatus, progressCtx, smoothResume.fromIdx)
      : await smoothPages(format, rawPages, callApi, voiceCard, onStatus, progressCtx);

    // Validator uses source-map slicing per output page.
    const slices = computePageSlicesFromSourceMap(ocrPages, pages, sourceByOutput);
    onStatus?.('Validating pages against source...');
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard, progressCtx);

    if (progressCtx) await saveProgress(progressCtx, { lastCompletedPhase: 'done' });
    return { title, author, summary, pages };
  }

  // Semantic chunking removed — allocations always null for the classic/per-page paths.
  const allocations: AllocatedChunk[] | null = null;

  // Strategy 3: Per-Page Generation + Chunked Smoothing path.
  if (flags.perPageSmoothing) {
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

    // Smoothing pass.
    onStatus?.('Smoothing pass...');
    const smoothResume = prior?.lastCompletedPhase === 'smooth' && prior.smoothedPages
      ? { pages: prior.smoothedPages, fromIdx: (prior.lastCompletedIndex ?? -1) + 1 }
      : null;
    pages = smoothResume
      ? await smoothPages(format, smoothResume.pages, callApi, voiceCard, onStatus, progressCtx, smoothResume.fromIdx)
      : await smoothPages(format, pages, callApi, voiceCard, onStatus, progressCtx);

    // Validator still runs (word-cap + fabrication check).
    const slices = computePageSlicesFromAllocations(ocrPages, pages, allocations, expectedPages, totalPdfPages);
    onStatus?.('Validating pages against source...');
    pages = await validateAndRepair(callApi, format, pages, slices, wordCountMax, onStatus, voiceCard, progressCtx);

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

  // Batch mode — split OCR text into uniform chunks.
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

  let title = prior?.meta?.title || '';
  let author = prior?.meta?.author || '';
  let summary = prior?.meta?.summary || '';
  // Resume from prior raw pages if same path (classic batch).
  const startBatchIdx = (prior?.lastCompletedPhase === 'batchGen' && prior?.rawPages)
    ? (prior.lastCompletedIndex ?? -1) + 1
    : 0;
  const allPages: GeneratedPage[] = startBatchIdx > 0 && prior?.rawPages ? [...prior.rawPages] : [];

  for (let b = startBatchIdx; b < batches.length; b++) {
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
      title = parsed.title || title;
      author = parsed.author || author;
      summary = parsed.summary || summary;
      if (progressCtx) await saveProgress(progressCtx, { meta: { title, author, summary } });
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
