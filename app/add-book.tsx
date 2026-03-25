import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiKey, getOpenRouterKey, getOpenRouterModel } from '@/lib/apiKeyStorage';
import { useBooksContext } from '@/lib/BooksContext';
import { GeminiBookResult, pickCoverColor, processPdfWithGemini } from '@/lib/gemini';
import { processWithOpenRouter, ProgressiveCallbacks } from '@/lib/openrouter';
import { Book } from '@/types';

type ProcessingMode = 'summary' | 'page-by-page';

type ScreenState = 'idle' | 'processing' | 'preview' | 'error';

const STATUS_MESSAGES = [
  'Reading PDF...',
  'Detecting chapters...',
  'Generating summaries...',
  'Extracting metadata...',
  'Almost done...',
];

function assembleBook(result: GeminiBookResult): Book {
  return {
    id: Date.now(),
    title: result.title,
    author: result.author,
    reads: '0 reads',
    coverColor: pickCoverColor(),
    quote: result.quote,
    tags: result.tags,
    chapters: result.chapters.map((ch, ci) => ({
      id: ci + 1,
      title: ch.title,
      summary: ch.summary,
      pages: ch.pages.map((p, pi) => ({
        id: pi + 1,
        summary: p.summary,
      })),
      likes: 0,
      bookmarks: 0,
    })),
  };
}

export default function AddBookScreen() {
  const router = useRouter();
  const { addBook, updateBook } = useBooksContext();
  const [state, setState] = useState<ScreenState>('idle');
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<ProcessingMode>('summary');
  const [statusText, setStatusText] = useState('');
  const fileUriRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (state === 'processing') {
      setStatusIndex(0);
      timerRef.current = setInterval(() => {
        setStatusIndex(prev => (prev + 1) % STATUS_MESSAGES.length);
      }, 3000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const [missingKey, setMissingKey] = useState(false);

  const pickAndProcess = useCallback(async () => {
    try {
      if (mode === 'summary') {
        const apiKey = await getApiKey();
        if (!apiKey) { setMissingKey(true); return; }

        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const file = result.assets[0];
        if (!file) return;

        if (file.size && file.size > 20 * 1024 * 1024) {
          setError('PDF is too large. Maximum size is 20MB.');
          setState('error');
          return;
        }

        setFileName(file.name);
        fileUriRef.current = file.uri;
        setState('processing');

        const geminiResult = await processPdfWithGemini(file.uri, apiKey);
        const assembled = assembleBook(geminiResult);
        setBook(assembled);
        setState('preview');
      } else {
        // Page-by-page mode via OpenRouter
        const orKey = await getOpenRouterKey();
        if (!orKey) {
          setError('OpenRouter API key required. Add it in Settings.');
          setState('error');
          return;
        }
        const orModel = await getOpenRouterModel();

        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const file = result.assets[0];
        if (!file) return;

        setFileName(file.name);
        fileUriRef.current = file.uri;
        setState('processing');

        const bookId = Date.now();
        const coverColor = pickCoverColor();
        let bookAdded = false;

        const callbacks: ProgressiveCallbacks = {
          onStatus: (msg) => setStatusText(msg),
          onFirstBook: async (partial) => {
            const assembled = assembleBook(partial);
            assembled.id = bookId;
            assembled.coverColor = coverColor;
            assembled.mode = 'page-by-page';
            await addBook(assembled);
            bookAdded = true;
            // Navigate directly to pages (chapter 1)
            router.replace(`/read/${bookId}/chapter/1` as any);
          },
          onBookUpdated: async (updated) => {
            const assembled = assembleBook(updated);
            assembled.id = bookId;
            assembled.coverColor = coverColor;
            assembled.mode = 'page-by-page';
            await updateBook(assembled);
          },
        };

        await processWithOpenRouter(file.uri, orKey, orModel, callbacks);
        setState('idle');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong processing the PDF.');
      setState('error');
    }
  }, [mode]);

  const handleAddToLibrary = useCallback(async () => {
    if (!book) return;
    await addBook(book);
    router.back();
  }, [book, addBook, router]);

  const handleRetry = useCallback(() => {
    setState('idle');
    setError('');
    setBook(null);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Book</Text>
        <View style={{ width: 24 }} />
      </View>

      {state === 'idle' && !missingKey && (
        <View style={styles.centered}>
          <Ionicons name="document-attach" size={64} color="#9ca3af" />
          <Text style={styles.idleTitle}>Upload a PDF</Text>
          <Text style={styles.idleSubtitle}>
            Select a book PDF and we'll generate a readable summary with chapters
          </Text>

          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeOption, mode === 'summary' && styles.modeOptionActive]}
              onPress={() => setMode('summary')}
            >
              <Text style={[styles.modeText, mode === 'summary' && styles.modeTextActive]}>
                Summary
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeOption, mode === 'page-by-page' && styles.modeOptionActive]}
              onPress={() => setMode('page-by-page')}
            >
              <Text style={[styles.modeText, mode === 'page-by-page' && styles.modeTextActive]}>
                Page-by-Page
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modeHint}>
            {mode === 'summary'
              ? 'Gemini generates narrative summaries per chapter'
              : 'OCR + OpenRouter rewrites each page in 30-50 words'}
          </Text>

          <TouchableOpacity style={styles.uploadButton} onPress={pickAndProcess}>
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.uploadButtonText}>Select PDF</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'processing' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.processingFile}>{fileName}</Text>
          <Text style={styles.processingStatus}>
            {mode === 'page-by-page' && statusText ? statusText : STATUS_MESSAGES[statusIndex]}
          </Text>
        </View>
      )}

      {state === 'preview' && book && (
        <ScrollView contentContainerStyle={styles.previewContainer}>
          <View style={[styles.previewCover, { backgroundColor: book.coverColor }]}>
            <Text style={styles.previewCoverTitle}>{book.title}</Text>
            <Text style={styles.previewCoverAuthor}>{book.author}</Text>
          </View>

          <View style={styles.previewMeta}>
            <Text style={styles.previewLabel}>Chapters</Text>
            <Text style={styles.previewValue}>{book.chapters.length}</Text>
          </View>

          <View style={styles.previewMeta}>
            <Text style={styles.previewLabel}>Tags</Text>
            <Text style={styles.previewValue}>{book.tags.join(', ')}</Text>
          </View>

          <View style={styles.previewMeta}>
            <Text style={styles.previewLabel}>Quote</Text>
            <Text style={[styles.previewValue, { fontStyle: 'italic' }]}>"{book.quote}"</Text>
          </View>

          <TouchableOpacity style={styles.addButton} onPress={handleAddToLibrary}>
            <Ionicons name="library-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add to Library</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.discardButton} onPress={handleRetry}>
            <Text style={styles.discardButtonText}>Discard</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {missingKey && (
        <View style={styles.centered}>
          <Ionicons name="key-outline" size={64} color="#f59e0b" />
          <Text style={styles.idleTitle}>API Key Required</Text>
          <Text style={styles.idleSubtitle}>
            To generate book summaries, please add your Gemini API key in Settings.
          </Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => {
              router.back();
              setTimeout(() => router.push('/settings' as any), 100);
            }}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={styles.uploadButtonText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={64} color="#ef4444" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.uploadButton} onPress={handleRetry}>
            <Text style={styles.uploadButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    justifyContent: 'space-between',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  idleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  idleSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 22,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  processingFile: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 20,
  },
  processingStatus: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8,
  },
  previewContainer: {
    padding: 20,
    alignItems: 'center',
  },
  previewCover: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  previewCoverTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  previewCoverAuthor: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  previewMeta: {
    width: '100%',
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  previewLabel: {
    width: 80,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  previewValue: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 28,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  discardButton: {
    paddingVertical: 12,
    marginTop: 12,
  },
  discardButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '500',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 20,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  modeOption: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modeOptionActive: {
    backgroundColor: '#3b82f6',
  },
  modeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  modeTextActive: {
    color: '#fff',
  },
  modeHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
});
