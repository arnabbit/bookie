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

import { useBooksContext } from '@/lib/BooksContext';
import { GeminiBookResult, pickCoverColor, processPdfWithGemini } from '@/lib/gemini';
import { Book } from '@/types';

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
  const { addBook } = useBooksContext();
  const [state, setState] = useState<ScreenState>('idle');
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [fileName, setFileName] = useState('');
  const fileUriRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

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

  const pickAndProcess = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (!file) return;

      // Check file size (20MB limit for Gemini inline data)
      if (file.size && file.size > 20 * 1024 * 1024) {
        setError('PDF is too large. Maximum size is 20MB.');
        setState('error');
        return;
      }

      setFileName(file.name);
      fileUriRef.current = file.uri;
      setState('processing');

      const geminiResult = await processPdfWithGemini(file.uri);
      const assembled = assembleBook(geminiResult);
      setBook(assembled);
      setState('preview');
    } catch (e: any) {
      setError(e.message || 'Something went wrong processing the PDF.');
      setState('error');
    }
  }, []);

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

      {state === 'idle' && (
        <View style={styles.centered}>
          <Ionicons name="document-attach" size={64} color="#9ca3af" />
          <Text style={styles.idleTitle}>Upload a PDF</Text>
          <Text style={styles.idleSubtitle}>
            Select a book PDF and we'll generate a readable summary with chapters
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
          <Text style={styles.processingStatus}>{STATUS_MESSAGES[statusIndex]}</Text>
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
});
