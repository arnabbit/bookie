import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, useAuth } from '@/lib/AuthContext';
import { io, Socket } from 'socket.io-client';
import { colors, fonts, radius, shadows } from '@/lib/theme';

interface Message {
  _id: string;
  content: string;
  type: 'text' | 'book-share';
  sender: { _id: string; username: string; avatar?: string };
  sharedBookPage?: { book: string; bookTitle: string; pageNumber: number; content: string; format?: string };
  createdAt: string;
}

export default function ChatScreen() {
  const { id: conversationId, username } = useLocalSearchParams<{ id: string; username: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setMessages(await res.json());
      } catch {} finally { setLoading(false); }
    })();
  }, [conversationId, token]);

  useEffect(() => {
    const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('join-conversation', conversationId);
    socket.on('new-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });
    return () => {
      socket.emit('leave-conversation', conversationId);
      socket.off('new-message');
      socket.disconnect();
    };
  }, [conversationId, token]);

  const sendMessage = useCallback(
    (text: string, type: 'text' | 'book-share' = 'text', bookPage?: any) => {
      if (!socketRef.current) return;
      socketRef.current.emit('send-message', { conversationId, content: text, type, sharedBookPage: bookPage });
      setMessages((prev) => [
        ...prev,
        {
          _id: Date.now().toString(),
          content: text,
          type,
          sender: { _id: user?.id || '', username: user?.username || '' },
          sharedBookPage: bookPage,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [conversationId, user]
  );

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  const openBookPicker = async () => {
    try {
      const res = await fetch(`${API_URL}/api/books`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBooks(await res.json());
    } catch {}
    setShowBookPicker(true);
  };

  const initials = (name?: string) => (name?.substring(0, 2) || '?').toUpperCase();

  const renderMessage = ({ item }: { item: Message }) => {
    const senderUsername = item.sender?.username ?? item.sender;
    const isMine = senderUsername === user?.username;

    if (item.type === 'book-share' && item.sharedBookPage) {
      return (
        <View style={[styles.msgWrap, isMine ? styles.msgWrapRight : styles.msgWrapLeft]}>
          <TouchableOpacity
            style={styles.shareCard}
            onPress={() => (router as any).push({
              pathname: '/(tabs)/books',
              params: { openBook: item.sharedBookPage!.book, format: item.sharedBookPage!.format || 'mini' },
            })}
            activeOpacity={0.8}
          >
            <View style={styles.shareCardInner}>
              <View style={styles.shareCardContent}>
                <Text style={styles.shareLabel}>Shared Page {item.sharedBookPage.pageNumber + 1}</Text>
                <Text style={styles.shareBookTitle} numberOfLines={1}>{item.sharedBookPage.bookTitle || 'Untitled'}</Text>
                {item.sharedBookPage.content ? (
                  <Text style={styles.shareQuote} numberOfLines={3}>
                    "{item.sharedBookPage.content}"
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.viewPageBtn}>
                  <Text style={styles.viewPageBtnText}>View Page</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.msgWrap, isMine ? styles.msgWrapRight : styles.msgWrapLeft]}>
        {!isMine && (
          <View style={styles.incomingAvatar}>
            <Text style={styles.incomingAvatarText}>{initials(senderUsername as string)}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={isMine ? styles.textMine : styles.textTheirs}>{item.content}</Text>
          <Text style={isMine ? styles.timeMine : styles.timeTheirs}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{username}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurfaceVariant} />
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.tertiary} />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item._id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          style={{ flex: 1, backgroundColor: colors.surface }}
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.bookBtn} onPress={openBookPicker}>
          <Ionicons name="book-outline" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.onSurfaceVariant + '80'}
            multiline
            onSubmitEditing={handleSend}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Ionicons name="send" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>

      {/* Book Picker Modal */}
      <Modal visible={showBookPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share a Book Page</Text>
              <TouchableOpacity onPress={() => setShowBookPicker(false)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={books}
              keyExtractor={(b) => b._id}
              ListEmptyComponent={<Text style={styles.empty}>No books</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.bookItem}
                  onPress={() => (router as any).push({ pathname: '/book-picker', params: { bookId: item._id, conversationId } })}
                >
                  <Text style={styles.bookItemTitle}>{item.title}</Text>
                  <Text style={styles.bookItemAuthor}>{item.author}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 54 : 12,
    backgroundColor: colors.surface,
    gap: 12,
  },
  headerBack: { padding: 4 },
  headerInfo: { flex: 1 },
  headerName: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  headerStatus: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.tertiary,
  },

  // Messages
  messagesList: { paddingVertical: 16, paddingHorizontal: 16, flexGrow: 1 },
  msgWrap: { flexDirection: 'row', marginVertical: 4, maxWidth: '85%', gap: 8 },
  msgWrapRight: { alignSelf: 'flex-end' },
  msgWrapLeft: { alignSelf: 'flex-start' },

  incomingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  incomingAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },

  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, minWidth: 60 },
  bubbleMine: {
    backgroundColor: colors.primaryContainer,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomLeftRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.secondaryContainer,
    ...shadows.sm,
  },
  textMine: { fontFamily: fonts.body, fontSize: 14, color: colors.surface, lineHeight: 20 },
  textTheirs: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  timeMine: { fontFamily: fonts.body, fontSize: 9, color: colors.surface + '99', marginTop: 4, alignSelf: 'flex-end' as const },
  timeTheirs: { fontFamily: fonts.body, fontSize: 9, color: colors.onSurfaceVariant, marginTop: 4, alignSelf: 'flex-end' as const },

  // Book share card
  shareCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.tertiary,
    overflow: 'hidden',
    ...shadows.sm,
  },
  shareCardInner: { flexDirection: 'column' },
  shareCardContent: { padding: 14 },
  shareLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.tertiary,
    marginBottom: 4,
  },
  shareBookTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.onSurface,
    marginBottom: 6,
  },
  shareQuote: {
    fontFamily: fonts.headlineItalic,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 10,
  },
  viewPageBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  viewPageBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.onTertiary,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    backgroundColor: `${colors.surface}cc`,
    gap: 8,
  },
  bookBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceContainerHighest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 24,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  textInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalTitle: { fontFamily: fonts.headlineBold, fontSize: 18, color: colors.onSurface },
  bookItem: { paddingHorizontal: 24, paddingVertical: 14 },
  bookItemTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.onSurface },
  bookItemAuthor: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  empty: { fontFamily: fonts.body, textAlign: 'center', padding: 24, color: colors.onSurfaceVariant },
});
