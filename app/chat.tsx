import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';

import { getApiKey } from '@/lib/apiKeyStorage';
import { useBooksContext } from '@/lib/BooksContext';
import { Book, Chapter, Page } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export default function ChatScreen() {
  const { bookId, chapterId, pageIndex: pageIndexStr } = useLocalSearchParams();
  const router = useRouter();
  const { books } = useBooksContext();

  const book = useMemo(() => books.find((b: Book) => b.id === Number(bookId)), [bookId, books]);
  const chapter = useMemo(
    () => book?.chapters.find((c: Chapter) => c.id === Number(chapterId)),
    [book, chapterId]
  );
  const pageIndex = Number(pageIndexStr) || 0;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const systemContext = useMemo(() => {
    if (!chapter) return '';
    const pages = chapter.pages;
    const isPageByPage = book?.mode === 'page-by-page';

    const getPageText = (idx: number): string | null => {
      const page = pages[idx];
      if (!page) return null;
      if (isPageByPage && page.originalText) return page.originalText;
      return page.summary;
    };

    const prev = getPageText(pageIndex - 1);
    const curr = getPageText(pageIndex);
    const next = getPageText(pageIndex + 1);

    let ctx = `You are a helpful reading assistant. The user is reading "${book?.title || 'a book'}".\n\n`;
    ctx += `They are currently on page ${pageIndex + 1} of ${pages.length}.\n\n`;

    if (isPageByPage) {
      ctx += 'Below is the original text from the book for context:\n\n';
    } else {
      ctx += 'Below are the page summaries for context:\n\n';
    }

    if (prev) ctx += `--- Previous page (${pageIndex}) ---\n${prev}\n\n`;
    if (curr) ctx += `--- Current page (${pageIndex + 1}) ---\n${curr}\n\n`;
    if (next) ctx += `--- Next page (${pageIndex + 2}) ---\n${next}\n\n`;

    ctx += 'Help the user understand what they are reading. Be concise and clear. If they ask about something on the page, reference the text directly.';
    return ctx;
  }, [book, chapter, pageIndex]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const apiKey = await getApiKey();
      if (!apiKey) throw new Error('Gemini API key not set. Add it in Settings.');

      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemContext }] },
          contents: history,
        }),
      });

      if (!res.ok) throw new Error(`Gemini error (${res.status})`);
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response';

      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-r`, role: 'model', text: reply },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: 'model', text: `Error: ${e.message}` },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, systemContext]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.modelBubble]}>
        {isUser ? (
          <Text style={styles.userText}>{item.text}</Text>
        ) : (
          <Markdown style={mdStyles}>{item.text}</Markdown>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Page {pageIndex + 1} Chat
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>Ask anything about this page</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask about this page..."
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#1f2937',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});

const mdStyles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22, color: '#1f2937' },
  strong: { fontWeight: '700' },
  heading1: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  heading2: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  code_inline: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 4,
    borderRadius: 4,
    color: '#3b82f6',
  },
  fence: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
});
