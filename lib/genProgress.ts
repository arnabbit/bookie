import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratedPage, StrategyFlags } from './geminiAdmin';

// Bumped from 1 → 2 after removing semanticChunking / backCheck / highlightMap
// strategies and their progress fields (highlights, importance, backCheckedPages).
export const SCHEMA_VERSION = 2;

export type GenPath = 'classic' | 'perPage' | 'wordCount';
export type GenFormat = 'mini' | 'pro' | 'ultra';

export interface OcrPageLite {
  pageNum: number;
  text: string;
}

export interface ProgressState {
  schemaVersion: number;
  startedAt: number;
  format: GenFormat;
  flags: StrategyFlags;
  path: GenPath;
  voiceCard?: string;
  ocrPages?: OcrPageLite[];
  bodyRange?: { startPage: number; endPage: number; startLabel?: string; endLabel?: string };
  allocations?: { sourcePage: number; outCount: number; words: number }[];
  // Classic-batch chapter mapping (per-chapter batching). Each entry maps a chapter
  // to its PDF page range, output page range, and optional label.
  chapters?: { startPage: number; endPage: number; outStart: number; outEnd: number; label?: string }[];
  rawPages?: GeneratedPage[];
  // sourceByOutput entries (Map serialized as array of [outPage, srcPage]).
  sourceByOutput?: [number, number][];
  smoothedPages?: GeneratedPage[];
  validatedPages?: GeneratedPage[];
  meta?: { title: string; author: string; summary: string };
  lastCompletedPhase?: string;
  lastCompletedIndex?: number;
  failedPhase?: string;
  failedReason?: string;
}

export interface ProgressCtx {
  bookId: string;
  format: GenFormat;
}

export function progressKey(bookId: string, format: GenFormat): string {
  return `admin.gen.${bookId}.${format}.progress`;
}

export async function loadProgress(bookId: string, format: GenFormat): Promise<ProgressState | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey(bookId, format));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) {
      // Silent reset on schema mismatch.
      await AsyncStorage.removeItem(progressKey(bookId, format)).catch(() => {});
      return null;
    }
    return parsed as ProgressState;
  } catch (e) {
    console.warn('[genProgress] loadProgress failed, clearing entry', e);
    try { await AsyncStorage.removeItem(progressKey(bookId, format)); } catch {}
    return null;
  }
}

export async function saveProgress(
  ctx: ProgressCtx | undefined,
  partial: Partial<ProgressState>,
): Promise<void> {
  if (!ctx) return;
  try {
    const existing = (await loadProgress(ctx.bookId, ctx.format)) || {
      schemaVersion: SCHEMA_VERSION,
      startedAt: Date.now(),
      format: ctx.format,
      flags: {},
      path: 'classic' as GenPath,
    };
    const merged: ProgressState = { ...existing, ...partial, schemaVersion: SCHEMA_VERSION };
    await AsyncStorage.setItem(progressKey(ctx.bookId, ctx.format), JSON.stringify(merged));
  } catch (e) {
    console.warn('[genProgress] saveProgress failed', e);
  }
}

export async function clearProgress(ctx: ProgressCtx | undefined): Promise<void> {
  if (!ctx) return;
  try {
    await AsyncStorage.removeItem(progressKey(ctx.bookId, ctx.format));
  } catch (e) {
    console.warn('[genProgress] clearProgress failed', e);
  }
}

// Convenience: mark a phase complete (no index).
export async function markPhase(
  ctx: ProgressCtx | undefined,
  phase: string,
): Promise<void> {
  await saveProgress(ctx, { lastCompletedPhase: phase, lastCompletedIndex: undefined });
}

// Convenience: update mid-loop progress.
export async function markIteration(
  ctx: ProgressCtx | undefined,
  phase: string,
  index: number,
): Promise<void> {
  await saveProgress(ctx, { lastCompletedPhase: phase, lastCompletedIndex: index });
}

// Determine which path runs for a given format + flag set. Mirrors generateInBatches gating.
// All processing strategies are Ultra-only; Mini/Pro always run the classic path.
export function resolvePath(format: GenFormat, flags: StrategyFlags): GenPath {
  if (format !== 'ultra') return 'classic';
  if (flags.wordCountAllocation) return 'wordCount';
  if (flags.perPageSmoothing) return 'perPage';
  return 'classic';
}

// Compare two flag objects after path resolution — they're "compatible" if they yield the same path.
// Also requires chapterDetection to match: it changes batching/smoothing structure across all paths,
// so cached chapters/smoothing chunks would be wrong if the toggle flipped between runs.
export function flagsCompatible(
  a: StrategyFlags,
  b: StrategyFlags,
  format: GenFormat,
): boolean {
  if (resolvePath(format, a) !== resolvePath(format, b)) return false;
  // Default true; treat undefined as true.
  const aChap = a.chapterDetection !== false;
  const bChap = b.chapterDetection !== false;
  return aChap === bChap;
}
