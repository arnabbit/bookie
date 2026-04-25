import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, useAuth } from '@/lib/AuthContext';
import { colors, fonts, radius, shadows, FORMAT_DISPLAY } from '@/lib/theme';
import { generateFormatFromPdf, generateFormatFromPdfOpenRouter, generateFormatFromFull, generateFormatFromFullOpenRouter, GeneratedPage, StrategyFlags, cancelCurrentBatchRequest, DEFAULT_WORD_COUNT_MAX } from '@/lib/geminiAdmin';
import { clearProgress, loadProgress } from '@/lib/genProgress';

const WORD_CAP_STORAGE_KEY = 'admin.wordCountMax';
const STRATEGY_STORAGE_KEYS = {
  semanticChunking: 'admin.strategy.semanticChunking',
  perPageSmoothing: 'admin.strategy.perPageSmoothing',
  backCheck: 'admin.strategy.backCheck',
  highlightMap: 'admin.strategy.highlightMap',
  wordCountAllocation: 'admin.strategy.wordCountAllocation',
} as const;

type FormatKey = 'mini' | 'pro' | 'ultra';
type Screen = 'list' | 'editor';

interface BookListItem {
  _id: string;
  title: string;
  author: string;
  summary: string;
  coverUrl: string;
  availableFormats: FormatKey[];
  pageCounts: Record<FormatKey, number>;
}

interface BookFull {
  _id: string;
  title: string;
  author: string;
  summary: string;
  coverUrl: string;
  formats: Record<FormatKey, { pageNumber: number; content: string; imageUrl?: string }[]>;
}

const FORMAT_KEYS: FormatKey[] = ['mini', 'pro', 'ultra'];

export default function AdminScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('list');
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBook, setEditingBook] = useState<BookFull | null>(null);
  const [activeFormat, setActiveFormat] = useState<FormatKey>('mini');
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [editingPageIdx, setEditingPageIdx] = useState<number | null>(null);
  const [editPageContent, setEditPageContent] = useState('');
  const [saving, setSaving] = useState(false);
  // Metadata editing
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');
  const [metaSummary, setMetaSummary] = useState('');
  const [metaCoverUrl, setMetaCoverUrl] = useState('');
  // New book
  const [showNewBook, setShowNewBook] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  // API keys (fetched from server)
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  // Unsaved generated pages (preview before save)
  const [previewPages, setPreviewPages] = useState<GeneratedPage[] | null>(null);
  // Custom OpenRouter model
  const [customModel, setCustomModel] = useState('google/gemini-3.1-flash-lite-preview');
  const [showCustomModel, setShowCustomModel] = useState(false);
  // Validator word-count cap (persisted)
  const [wordCountMaxText, setWordCountMaxText] = useState(String(DEFAULT_WORD_COUNT_MAX));
  // Strategy toggles (persisted)
  const [semanticChunking, setSemanticChunking] = useState(false);
  const [perPageSmoothing, setPerPageSmoothing] = useState(false);
  const [backCheck, setBackCheck] = useState(false);
  const [highlightMap, setHighlightMap] = useState(false);
  const [wordCountAllocation, setWordCountAllocation] = useState(false);
  // Error popup
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Generation error modal (separate flow — supports retry/discard).
  const [genError, setGenError] = useState<{ phase: string; message: string; canRetry: boolean } | null>(null);
  type GenKind = 'pdfGemini' | 'pdfOR' | 'pdfORCustom' | 'fromFull' | 'fromFullOR' | 'fromFullORCustom';
  type GenAttempt = { kind: GenKind; args: any } | null;
  const lastGenAttemptRef = useRef<GenAttempt>(null);

  const strategyFlags: StrategyFlags = {
    semanticChunking,
    perPageSmoothing,
    backCheck,
    highlightMap,
    wordCountAllocation,
  };

  const wordCountMax = (() => {
    const n = parseInt(wordCountMaxText, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WORD_COUNT_MAX;
  })();

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const showError = (msg: string) => setErrorMsg(msg || 'Unknown error');

  // Throw on non-ok response with server message if available.
  const ensureOk = async (res: Response, label: string) => {
    if (res.ok) return;
    let detail = '';
    try {
      const text = await res.text();
      try { detail = JSON.parse(text)?.error || JSON.parse(text)?.message || text; }
      catch { detail = text; }
    } catch {}
    throw new Error(`${label} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  };

  // Fetch books list
  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/books`, { headers: { Authorization: `Bearer ${token}` } });
      await ensureOk(res, 'Load books');
      setBooks(await res.json());
    } catch (e: any) { showError(e.message); }
  }, [token]);

  // Fetch API keys
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/gemini-key`, { headers: { Authorization: `Bearer ${token}` } });
        await ensureOk(res, 'Fetch Gemini key');
        const d = await res.json(); setGeminiKey(d.key);
      } catch (e: any) { showError(e.message); }
      try {
        const res = await fetch(`${API_URL}/api/admin/openrouter-key`, { headers: { Authorization: `Bearer ${token}` } });
        await ensureOk(res, 'Fetch OpenRouter key');
        const d = await res.json(); setOpenRouterKey(d.key);
      } catch (e: any) { showError(e.message); }
    })();
  }, [token]);

  // Load persisted word-count cap.
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(WORD_CAP_STORAGE_KEY);
        if (v != null && v.trim()) setWordCountMaxText(v);
      } catch {}
    })();
  }, []);

  // Persist on change.
  useEffect(() => {
    AsyncStorage.setItem(WORD_CAP_STORAGE_KEY, String(wordCountMax)).catch(() => {});
  }, [wordCountMax]);

  // Load persisted strategy toggles.
  useEffect(() => {
    (async () => {
      try {
        const sc = await AsyncStorage.getItem(STRATEGY_STORAGE_KEYS.semanticChunking);
        if (sc != null) setSemanticChunking(sc === '1');
        const pp = await AsyncStorage.getItem(STRATEGY_STORAGE_KEYS.perPageSmoothing);
        if (pp != null) setPerPageSmoothing(pp === '1');
        const bc = await AsyncStorage.getItem(STRATEGY_STORAGE_KEYS.backCheck);
        if (bc != null) setBackCheck(bc === '1');
        const hm = await AsyncStorage.getItem(STRATEGY_STORAGE_KEYS.highlightMap);
        if (hm != null) setHighlightMap(hm === '1');
        const wc = await AsyncStorage.getItem(STRATEGY_STORAGE_KEYS.wordCountAllocation);
        if (wc != null) setWordCountAllocation(wc === '1');
      } catch {}
    })();
  }, []);

  useEffect(() => { AsyncStorage.setItem(STRATEGY_STORAGE_KEYS.semanticChunking, semanticChunking ? '1' : '0').catch(() => {}); }, [semanticChunking]);
  useEffect(() => { AsyncStorage.setItem(STRATEGY_STORAGE_KEYS.perPageSmoothing, perPageSmoothing ? '1' : '0').catch(() => {}); }, [perPageSmoothing]);
  useEffect(() => { AsyncStorage.setItem(STRATEGY_STORAGE_KEYS.backCheck, backCheck ? '1' : '0').catch(() => {}); }, [backCheck]);
  useEffect(() => { AsyncStorage.setItem(STRATEGY_STORAGE_KEYS.highlightMap, highlightMap ? '1' : '0').catch(() => {}); }, [highlightMap]);
  useEffect(() => { AsyncStorage.setItem(STRATEGY_STORAGE_KEYS.wordCountAllocation, wordCountAllocation ? '1' : '0').catch(() => {}); }, [wordCountAllocation]);

  useEffect(() => {
    (async () => { setLoading(true); await fetchBooks(); setLoading(false); })();
  }, [fetchBooks]);

  // Abort in-flight generation on unmount so it doesn't run in the background.
  const generatingRef = useRef(false);
  useEffect(() => { generatingRef.current = generating; }, [generating]);
  useEffect(() => {
    return () => {
      if (generatingRef.current) cancelCurrentBatchRequest();
    };
  }, []);

  // Open book editor
  const openBook = async (bookId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/books/${bookId}`, { headers: { Authorization: `Bearer ${token}` } });
      await ensureOk(res, 'Open book');
      const book = await res.json();
      setEditingBook(book);
      setMetaTitle(book.title);
      setMetaAuthor(book.author);
      setMetaSummary(book.summary || '');
      setMetaCoverUrl(book.coverUrl || '');
      setActiveFormat('mini');
      setPreviewPages(null);
      setScreen('editor');
    } catch (e: any) { showError(e.message); }
  };

  // Create new book
  const createBook = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/books`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: newTitle.trim(), author: newAuthor.trim() }),
      });
      await ensureOk(res, 'Create book');
      const book = await res.json();
      setShowNewBook(false);
      setNewTitle('');
      setNewAuthor('');
      await fetchBooks();
      openBook(book._id);
    } catch (e: any) { showError(e.message); }
  };

  // Save metadata
  const saveMeta = async () => {
    if (!editingBook) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: metaTitle, author: metaAuthor, summary: metaSummary, coverUrl: metaCoverUrl }),
      });
      await ensureOk(res, 'Save details');
      const updated = await res.json();
      setEditingBook((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  // Delete book
  const deleteBook = async () => {
    if (!editingBook) return;
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}`, { method: 'DELETE', headers });
        await ensureOk(res, 'Delete book');
        setScreen('list');
        setEditingBook(null);
        fetchBooks();
      } catch (e: any) { showError(e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${editingBook.title}"?`)) doDelete();
    } else {
      Alert.alert('Delete Book', `Delete "${editingBook.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Common runner for all generation flows. Threads bookId for progress persistence,
  // captures errors into genError modal (Retry/Discard), tracks lastGenAttempt for retry.
  const runGen = async (kind: GenKind, args: any) => {
    if (!editingBook) return;
    if (generating) return; // mutual exclusion
    lastGenAttemptRef.current = { kind, args };
    const bookId = editingBook._id;
    const fmt = activeFormat;

    setGenerating(true);
    setGenError(null);
    try {
      let gen;
      if (kind === 'pdfGemini') {
        gen = await generateFormatFromPdf(args.fileUri, geminiKey, fmt, setGenStatus, wordCountMax, strategyFlags, bookId);
      } else if (kind === 'pdfOR') {
        gen = await generateFormatFromPdfOpenRouter(args.fileUri, openRouterKey, fmt, setGenStatus, undefined, wordCountMax, strategyFlags, bookId);
      } else if (kind === 'pdfORCustom') {
        gen = await generateFormatFromPdfOpenRouter(args.fileUri, openRouterKey, fmt, setGenStatus, args.model, wordCountMax, strategyFlags, bookId);
      } else if (kind === 'fromFull') {
        const fullPages = editingBook.formats.ultra || [];
        gen = await generateFormatFromFull(fullPages, geminiKey, fmt, setGenStatus, wordCountMax, strategyFlags, bookId);
      } else if (kind === 'fromFullOR') {
        const fullPages = editingBook.formats.ultra || [];
        gen = await generateFormatFromFullOpenRouter(fullPages, openRouterKey, fmt, setGenStatus, undefined, wordCountMax, strategyFlags, bookId);
      } else if (kind === 'fromFullORCustom') {
        const fullPages = editingBook.formats.ultra || [];
        gen = await generateFormatFromFullOpenRouter(fullPages, openRouterKey, fmt, setGenStatus, args.model, wordCountMax, strategyFlags, bookId);
      } else {
        throw new Error(`Unknown gen kind: ${kind}`);
      }

      if (!metaSummary && gen.summary) setMetaSummary(gen.summary);
      if (!metaTitle && gen.title) setMetaTitle(gen.title);
      if (!metaAuthor && gen.author) setMetaAuthor(gen.author);

      setPreviewPages(gen.pages);
      setGenStatus(`Generated ${gen.pages.length} pages. Review and save.`);

      // Success — clear progress + attempt.
      await clearProgress({ bookId, format: fmt });
      lastGenAttemptRef.current = null;
    } catch (err: any) {
      console.warn('[admin] gen failed', err);
      // Look up phase from persisted progress for richer error message.
      let phase = 'unknown';
      try {
        const prog = await loadProgress(bookId, fmt);
        if (prog?.lastCompletedPhase) phase = `after ${prog.lastCompletedPhase}`;
      } catch {}
      setGenStatus('');
      setGenError({
        phase,
        message: err?.message || 'Unknown error',
        canRetry: true,
      });
    } finally {
      setGenerating(false);
    }
  };

  const retryGen = async () => {
    const attempt = lastGenAttemptRef.current;
    if (!attempt) {
      setGenError(null);
      return;
    }
    setGenError(null);
    await runGen(attempt.kind, attempt.args);
  };

  const discardGen = async () => {
    if (editingBook) {
      await clearProgress({ bookId: editingBook._id, format: activeFormat });
    }
    lastGenAttemptRef.current = null;
    setGenError(null);
    setGenStatus('');
  };

  const pickPdf = async (): Promise<{ uri: string } | null> => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const file = result.assets[0];
    if (!file) return null;
    if (file.size && file.size > 30 * 1024 * 1024) {
      showError('PDF too large (max 30MB)');
      return null;
    }
    return { uri: file.uri };
  };

  // Generate with Gemini
  const generateWithGemini = async () => {
    if (!geminiKey) { showError('Server GEMINI_API_KEY not configured'); return; }
    const file = await pickPdf();
    if (!file) return;
    setGenStatus('Starting...');
    await runGen('pdfGemini', { fileUri: file.uri });
  };

  // Generate with Gemini via OpenRouter
  const generateWithOpenRouter = async () => {
    if (!openRouterKey) { showError('Server OPENROUTER_API_KEY not configured'); return; }
    const file = await pickPdf();
    if (!file) return;
    setGenStatus('Starting (OpenRouter)...');
    await runGen('pdfOR', { fileUri: file.uri });
  };

  // Generate with custom OpenRouter model
  const generateWithCustomOpenRouter = async () => {
    if (!openRouterKey) { showError('Server OPENROUTER_API_KEY not configured'); return; }
    if (!customModel.trim()) { showError('Enter a model name'); return; }
    const file = await pickPdf();
    if (!file) return;
    setGenStatus(`Starting (${customModel})...`);
    await runGen('pdfORCustom', { fileUri: file.uri, model: customModel.trim() });
  };

  // Generate mini/pro from existing Full (skips PDF upload)
  const generateFromFull = async (useOpenRouter: boolean, model?: string) => {
    if (!editingBook) return;
    const fullPages = editingBook.formats.ultra || [];
    if (!fullPages.length) { showError('No Full version exists yet'); return; }
    if (activeFormat === 'ultra') { showError('Switch to Essentials or Abridged first'); return; }
    const key = useOpenRouter ? openRouterKey : geminiKey;
    if (!key) { showError(`Server ${useOpenRouter ? 'OPENROUTER' : 'GEMINI'}_API_KEY not configured`); return; }

    setGenStatus('Starting from Full...');
    if (useOpenRouter) {
      if (model) await runGen('fromFullORCustom', { model });
      else await runGen('fromFullOR', {});
    } else {
      await runGen('fromFull', {});
    }
  };

  // Save generated/edited pages to server
  const savePages = async (pages: { pageNumber: number; content: string }[]) => {
    if (!editingBook) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}/format/${activeFormat}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pages }),
      });
      await ensureOk(res, 'Save pages');
      const data = await res.json();
      setEditingBook((prev) => {
        if (!prev) return prev;
        return { ...prev, formats: { ...prev.formats, [activeFormat]: data.pages } };
      });
      setPreviewPages(null);
      setGenStatus('');
      fetchBooks();
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  // Add blank page
  const addPage = () => {
    if (!editingBook) return;
    const pages = editingBook.formats[activeFormat] || [];
    const newPage = { pageNumber: pages.length + 1, content: '', imageUrl: '' };
    setEditingBook({
      ...editingBook,
      formats: { ...editingBook.formats, [activeFormat]: [...pages, newPage] },
    });
    // Open editor for the new page
    setEditingPageIdx(pages.length);
    setEditPageContent('');
  };

  // Save single page edit
  const savePageEdit = async () => {
    if (!editingBook || editingPageIdx === null) return;
    const pages = [...(editingBook.formats[activeFormat] || [])];
    pages[editingPageIdx] = { ...pages[editingPageIdx], content: editPageContent };
    // Update local state
    setEditingBook({
      ...editingBook,
      formats: { ...editingBook.formats, [activeFormat]: pages },
    });
    // Save to server
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}/format/${activeFormat}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pages }),
      });
      await ensureOk(res, 'Save page');
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
    setEditingPageIdx(null);
  };

  // Delete page
  const deletePage = async (idx: number) => {
    if (!editingBook) return;
    const pages = [...(editingBook.formats[activeFormat] || [])];
    pages.splice(idx, 1);
    pages.forEach((p, i) => { p.pageNumber = i + 1; });
    setEditingBook({
      ...editingBook,
      formats: { ...editingBook.formats, [activeFormat]: pages },
    });
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}/format/${activeFormat}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pages }),
      });
      await ensureOk(res, 'Delete page');
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  // Clear format
  const clearFormat = async () => {
    if (!editingBook) return;
    const doClear = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/books/${editingBook._id}/format/${activeFormat}`, {
          method: 'DELETE',
          headers,
        });
        await ensureOk(res, 'Clear format');
        setEditingBook({
          ...editingBook,
          formats: { ...editingBook.formats, [activeFormat]: [] },
        });
        fetchBooks();
      } catch (e: any) { showError(e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Clear all ${FORMAT_DISPLAY[activeFormat]} pages?`)) doClear();
    } else {
      Alert.alert('Clear Format', `Remove all ${FORMAT_DISPLAY[activeFormat]} pages?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const currentPages = previewPages || editingBook?.formats[activeFormat] || [];

  // ─── BOOK LIST ─────────────────────────────────────────
  if (screen === 'list') {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Admin Portal</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.tertiary} />
        ) : (
          <FlatList
            data={books}
            keyExtractor={(b) => b._id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.empty}>No books yet</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.bookRow} onPress={() => openBook(item._id)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bookRowTitle}>{item.title}</Text>
                  <Text style={s.bookRowAuthor}>{item.author}</Text>
                </View>
                <View style={s.formatBadges}>
                  {FORMAT_KEYS.map((f) => (
                    <View key={f} style={[s.badge, item.pageCounts[f] > 0 ? s.badgeActive : s.badgeEmpty]}>
                      <Text style={[s.badgeText, item.pageCounts[f] > 0 && s.badgeTextActive]}>
                        {FORMAT_DISPLAY[f]?.[0]}{item.pageCounts[f] > 0 ? ` ${item.pageCounts[f]}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* FAB */}
        <TouchableOpacity style={s.fab} onPress={() => setShowNewBook(true)}>
          <Ionicons name="add" size={28} color={colors.onPrimary} />
        </TouchableOpacity>

        {/* Error Modal */}
        <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />

        {/* New Book Modal */}
        <Modal visible={showNewBook} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalCardTitle}>New Book</Text>
              <TextInput style={s.input} placeholder="Title" placeholderTextColor={colors.outline} value={newTitle} onChangeText={setNewTitle} />
              <TextInput style={s.input} placeholder="Author" placeholderTextColor={colors.outline} value={newAuthor} onChangeText={setNewAuthor} />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setShowNewBook(false)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={createBook}>
                  <Text style={s.modalConfirmText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ─── BOOK EDITOR ───────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => { setScreen('list'); setEditingBook(null); setPreviewPages(null); fetchBooks(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{metaTitle || 'Edit Book'}</Text>
        {saving ? <ActivityIndicator size="small" color={colors.tertiary} /> : <View style={{ width: 24 }} />}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Metadata */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Book Details</Text>
            <TextInput style={s.input} placeholder="Title" placeholderTextColor={colors.outline} value={metaTitle} onChangeText={setMetaTitle} />
            <TextInput style={s.input} placeholder="Author" placeholderTextColor={colors.outline} value={metaAuthor} onChangeText={setMetaAuthor} />
            <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="Summary" placeholderTextColor={colors.outline} value={metaSummary} onChangeText={setMetaSummary} multiline />
            <TextInput style={s.input} placeholder="Cover URL" placeholderTextColor={colors.outline} value={metaCoverUrl} onChangeText={setMetaCoverUrl} />
            <TouchableOpacity style={s.saveMetaBtn} onPress={saveMeta}>
              <Text style={s.saveMetaBtnText}>Save Details</Text>
            </TouchableOpacity>
          </View>

          {/* Format Tabs */}
          <View style={s.formatTabs}>
            {FORMAT_KEYS.map((f) => {
              const count = editingBook?.formats[f]?.length || 0;
              const isActive = activeFormat === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[s.formatTab, isActive && s.formatTabActive]}
                  onPress={() => { setActiveFormat(f); setPreviewPages(null); }}
                >
                  <Text style={[s.formatTabText, isActive && s.formatTabTextActive]}>
                    {FORMAT_DISPLAY[f]}
                  </Text>
                  <Text style={[s.formatTabCount, isActive && s.formatTabCountActive]}>
                    {count} pg
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={s.section}>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionBtn, generating && { opacity: 0.5 }]}
                onPress={generateWithGemini}
                disabled={generating}
              >
                <Ionicons name="sparkles" size={18} color={colors.tertiary} />
                <Text style={s.actionBtnText}>Generate with Gemini</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, generating && { opacity: 0.5 }]}
                onPress={generateWithOpenRouter}
                disabled={generating}
              >
                <Ionicons name="flash" size={18} color={colors.tertiary} />
                <Text style={s.actionBtnText}>Gemini (OpenRouter)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, generating && { opacity: 0.5 }]}
                onPress={() => setShowCustomModel(!showCustomModel)}
                disabled={generating}
              >
                <Ionicons name="code-slash" size={18} color={colors.tertiary} />
                <Text style={s.actionBtnText}>OpenRouter (Custom)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={addPage}>
                <Ionicons name="add-circle-outline" size={18} color={colors.tertiary} />
                <Text style={s.actionBtnText}>Add Page</Text>
              </TouchableOpacity>
            </View>

            {activeFormat !== 'ultra' && (editingBook?.formats.ultra?.length ?? 0) > 0 && (
              <View style={[s.actionRow, { marginTop: 8 }]}>
                <TouchableOpacity
                  style={[s.actionBtn, generating && { opacity: 0.5 }]}
                  onPress={() => generateFromFull(false)}
                  disabled={generating}
                >
                  <Ionicons name="git-branch" size={18} color={colors.tertiary} />
                  <Text style={s.actionBtnText}>From Full (Gemini)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, generating && { opacity: 0.5 }]}
                  onPress={() => generateFromFull(true)}
                  disabled={generating}
                >
                  <Ionicons name="git-branch" size={18} color={colors.tertiary} />
                  <Text style={s.actionBtnText}>From Full (OpenRouter)</Text>
                </TouchableOpacity>
                {showCustomModel && customModel.trim().length > 0 && (
                  <TouchableOpacity
                    style={[s.actionBtn, generating && { opacity: 0.5 }]}
                    onPress={() => generateFromFull(true, customModel.trim())}
                    disabled={generating}
                  >
                    <Ionicons name="git-branch" size={18} color={colors.tertiary} />
                    <Text style={s.actionBtnText}>From Full ({customModel.split('/').pop()})</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showCustomModel && (
              <View style={s.customModelRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="e.g. google/gemini-2.5-flash-lite"
                  placeholderTextColor={colors.outline}
                  value={customModel}
                  onChangeText={setCustomModel}
                />
                <TouchableOpacity
                  style={[s.saveMetaBtn, { marginLeft: 8 }, generating && { opacity: 0.5 }]}
                  onPress={generateWithCustomOpenRouter}
                  disabled={generating}
                >
                  <Text style={s.saveMetaBtnText}>Generate</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={s.customModelRow}>
              <Text style={s.wordCapLabel}>Validator word cap</Text>
              <TextInput
                style={[s.input, { width: 80, marginBottom: 0, marginLeft: 8, textAlign: 'center' }]}
                placeholder={String(DEFAULT_WORD_COUNT_MAX)}
                placeholderTextColor={colors.outline}
                value={wordCountMaxText}
                onChangeText={(t) => setWordCountMaxText(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
              />
            </View>

            {/* Strategy Toggles */}
            <View style={s.strategyBox}>
              <Text style={s.sectionLabel}>Processing Strategies</Text>
              <Text style={s.strategyNote}>Voice card (style extraction) runs automatically before generation in every method.</Text>

              <View style={s.strategyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.strategyLabel}>Per-Page + Smoothing</Text>
                  <Text style={s.strategyHint}>One LLM call per output page, then chunked smoothing pass</Text>
                </View>
                <Switch value={perPageSmoothing} onValueChange={setPerPageSmoothing} disabled={generating} />
              </View>

              <View style={s.strategyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.strategyLabel}>Word-Count Allocation</Text>
                  <Text style={s.strategyHint}>Auto-trim front/back matter (LLM), then allocate output pages per source page by word count (÷240, &lt;0.4 floor else ceil). Per-page gen + smoothing. Format selector still controls writing-style rules, but output page count is driven by source word count + auto front/back trim (not by mini/pro/ultra). Overrides Per-Page+Smoothing.</Text>
                </View>
                <Switch value={wordCountAllocation} onValueChange={setWordCountAllocation} disabled={generating} />
              </View>

              <Text style={s.strategySubhead}>Ultra-only strategies</Text>
              <Text style={s.strategyNote}>These strategies only run when generating Ultra format. Toggle state is preserved across formats but ignored at runtime for Mini/Pro.</Text>

              <View style={s.strategyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.strategyLabel}>Semantic Chunking</Text>
                  <Text style={s.strategyHint}>Split on scene/chapter boundaries; allocate pages by importance. Affects classic batch grouping only — composes with other toggles.</Text>
                </View>
                <Switch value={semanticChunking} onValueChange={setSemanticChunking} disabled={generating} />
              </View>

              <View style={s.strategyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.strategyLabel}>Back-Check by Expansion</Text>
                  <Text style={s.strategyHint}>Expand drafted pages, judge vs source, regen on large delta. Runs after generation — composes with other toggles.</Text>
                </View>
                <Switch value={backCheck} onValueChange={setBackCheck} disabled={generating} />
              </View>

              <View style={s.strategyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.strategyLabel}>Highlight-Driven Map</Text>
                  <Text style={s.strategyHint}>Per-page highlight → classify story/filler → importance-aware gen. Output page count is variable (story pages may expand). Overrides Per-Page+Smoothing and Semantic Chunking. Mutually exclusive w/ Word-Count Allocation (Word-Count wins). Format selector still controls writing-style rules, but output page count is driven by per-page importance.</Text>
                </View>
                <Switch value={highlightMap} onValueChange={setHighlightMap} disabled={generating} />
              </View>
            </View>

            {generating && (
              <View style={s.genStatus}>
                <ActivityIndicator size="small" color={colors.tertiary} />
                <Text style={s.genStatusText}>{genStatus}</Text>
                <TouchableOpacity
                  style={s.retryBatchBtn}
                  onPress={() => {
                    const ok = cancelCurrentBatchRequest();
                    if (ok) setGenStatus((prev) => `Retrying... ${prev}`);
                  }}
                >
                  <Ionicons name="refresh" size={14} color={colors.onPrimary} />
                  <Text style={s.retryBatchBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {previewPages && !generating && (
              <View style={s.previewBanner}>
                <Text style={s.previewBannerText}>{genStatus}</Text>
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.savePreviewBtn} onPress={() => savePages(previewPages)}>
                    <Text style={s.savePreviewBtnText}>Save to Book</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.discardBtn} onPress={() => { setPreviewPages(null); setGenStatus(''); }}>
                    <Text style={s.discardBtnText}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Pages List */}
          <View style={s.section}>
            <View style={s.pagesHeader}>
              <Text style={s.sectionLabel}>Pages ({currentPages.length})</Text>
              {!previewPages && currentPages.length > 0 && (
                <TouchableOpacity onPress={clearFormat}>
                  <Text style={s.clearText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {currentPages.length === 0 ? (
              <Text style={s.empty}>No pages. Generate with Gemini or add manually.</Text>
            ) : (
              currentPages.map((page: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={s.pageCard}
                  onPress={() => { setEditingPageIdx(idx); setEditPageContent(page.content || ''); }}
                  activeOpacity={0.7}
                >
                  <View style={s.pageCardHeader}>
                    <Text style={s.pageNum}>Page {page.pageNumber ?? idx + 1}</Text>
                    {!previewPages && (
                      <TouchableOpacity onPress={() => deletePage(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={s.pagePreview} numberOfLines={3}>{page.content || '(empty)'}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Delete Book */}
          <View style={s.section}>
            <TouchableOpacity style={s.deleteBookBtn} onPress={deleteBook}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={s.deleteBookBtnText}>Delete Book</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Error Modal */}
      <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />

      {/* Gen Error Modal — Retry/Discard/Dismiss */}
      <GenErrorModal
        error={genError}
        canRetry={!!lastGenAttemptRef.current}
        onRetry={retryGen}
        onDiscard={discardGen}
        onDismiss={() => setGenError(null)}
      />

      {/* Page Edit Modal */}
      <Modal visible={editingPageIdx !== null} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.pageEditModal}>
            <View style={s.pageEditHeader}>
              <Text style={s.pageEditTitle}>
                Page {editingPageIdx !== null ? (editingPageIdx + 1) : ''}
              </Text>
              <TouchableOpacity onPress={() => setEditingPageIdx(null)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.pageEditInput}
              value={editPageContent}
              onChangeText={setEditPageContent}
              multiline
              placeholder="Page content..."
              placeholderTextColor={colors.outline}
              textAlignVertical="top"
            />
            <TouchableOpacity style={s.pageEditSave} onPress={savePageEdit}>
              <Text style={s.pageEditSaveText}>Save Page</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function GenErrorModal({
  error,
  canRetry,
  onRetry,
  onDiscard,
  onDismiss,
}: {
  error: { phase: string; message: string; canRetry: boolean } | null;
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={!!error} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={s.modalOverlay}>
        <View style={s.errorCard}>
          <View style={s.errorHeader}>
            <Ionicons name="alert-circle" size={22} color={colors.error} />
            <Text style={s.errorTitle}>Generation failed{error?.phase ? ` ${error.phase}` : ''}</Text>
          </View>
          <ScrollView style={s.errorBodyScroll}>
            <Text style={s.errorMsg} selectable>{error?.message}</Text>
            <Text style={[s.errorMsg, { marginTop: 8, fontSize: 12, color: colors.onSurfaceVariant }]}>
              Retry resumes from the last completed step. Discard clears saved progress and starts fresh next time. Dismiss closes this dialog and keeps progress.
            </Text>
          </ScrollView>
          <View style={s.modalBtns}>
            <TouchableOpacity style={[s.modalCancel, { flex: 1 }]} onPress={onDiscard}>
              <Text style={s.modalCancelText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalCancel, { flex: 1 }]} onPress={onDismiss}>
              <Text style={s.modalCancelText}>Dismiss</Text>
            </TouchableOpacity>
            {canRetry && (
              <TouchableOpacity style={[s.modalConfirm, { flex: 1 }]} onPress={onRetry}>
                <Text style={s.modalConfirmText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ErrorModal({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.errorCard}>
          <View style={s.errorHeader}>
            <Ionicons name="alert-circle" size={22} color={colors.error} />
            <Text style={s.errorTitle}>Error</Text>
          </View>
          <ScrollView style={s.errorBodyScroll}>
            <Text style={s.errorMsg} selectable>{message}</Text>
          </ScrollView>
          <TouchableOpacity style={s.errorDismiss} onPress={onClose}>
            <Text style={s.errorDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  topBarTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.onSurface,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  // Book list
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  bookRowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.onSurface },
  bookRowAuthor: { fontFamily: fonts.body, fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  formatBadges: { flexDirection: 'row', gap: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeActive: { backgroundColor: colors.tertiary + '20' },
  badgeEmpty: { backgroundColor: colors.surfaceContainerHigh },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 9, fontWeight: '700', color: colors.onSurfaceVariant },
  badgeTextActive: { color: colors.tertiary },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },

  // Section
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginBottom: 10,
  },

  // Inputs
  input: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
    marginBottom: 8,
  },
  saveMetaBtn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveMetaBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onPrimary },

  // Format tabs
  formatTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    padding: 3,
  },
  formatTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  formatTabActive: { backgroundColor: colors.surfaceContainerLowest, ...shadows.sm },
  formatTabText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurfaceVariant },
  formatTabTextActive: { color: colors.onSurface },
  formatTabCount: { fontFamily: fonts.body, fontSize: 10, color: colors.onSurfaceVariant + '80', marginTop: 2 },
  formatTabCountActive: { color: colors.tertiary },

  // Actions
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  customModelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  wordCapLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
  strategyBox: {
    marginTop: 14,
    padding: 14,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
  },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  strategyLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurface },
  strategyHint: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  strategyNote: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 4, fontStyle: 'italic' },
  strategySubhead: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginTop: 14,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    paddingVertical: 12,
  },
  actionBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurface },

  genStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
  },
  genStatusText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
  retryBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tertiary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  retryBatchBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onTertiary },

  previewBanner: {
    marginTop: 12,
    padding: 14,
    backgroundColor: colors.tertiary + '12',
    borderRadius: 12,
  },
  previewBannerText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.tertiary, marginBottom: 10 },
  savePreviewBtn: {
    flex: 1,
    backgroundColor: colors.tertiary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  savePreviewBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.onTertiary },
  discardBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  discardBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.onSurfaceVariant },

  // Pages
  pagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.error },
  pageCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  pageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pageNum: { fontFamily: fonts.bodyBold, fontSize: 11, fontWeight: '700', color: colors.tertiary },
  pagePreview: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurface, lineHeight: 20 },

  // Delete
  deleteBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.error + '30',
    marginTop: 16,
  },
  deleteBookBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.error },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalCardTitle: { fontFamily: fonts.headlineBold, fontSize: 20, color: colors.onSurface, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center' },
  modalCancelText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurfaceVariant },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primaryContainer, alignItems: 'center' },
  modalConfirmText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onPrimary },

  // Page edit modal
  pageEditModal: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
    padding: 24,
  },
  pageEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageEditTitle: { fontFamily: fonts.headlineBold, fontSize: 18, color: colors.onSurface },
  pageEditInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 16,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
    minHeight: 200,
    lineHeight: 22,
  },
  pageEditSave: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  pageEditSaveText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onPrimary },

  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 32 },

  // Error modal
  errorCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  errorTitle: { fontFamily: fonts.headlineBold, fontSize: 18, color: colors.error },
  errorBodyScroll: { maxHeight: 240, marginBottom: 16 },
  errorMsg: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  errorDismiss: {
    backgroundColor: colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  errorDismissText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onPrimary },
});
