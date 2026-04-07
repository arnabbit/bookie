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
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
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

const formatLastSeen = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
};

export default function ChatScreen() {
  const { id: conversationId, username, from } = useLocalSearchParams<{ id: string; username: string; from?: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const goBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      (router as any).replace(from || '/(tabs)/social');
    }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [msgsRes, convRes] = await Promise.all([
          fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/chat/conversations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const msgs: Message[] = msgsRes.ok ? await msgsRes.json() : [];
        console.log('[CHAT] msgs loaded:', msgs.length);
        setMessages(msgs);

        // Find first unread message + other user's online status
        if (convRes.ok) {
          const convs = await convRes.json();
          const conv = convs.find((c: any) => c._id === conversationId);
          console.log('[CHAT] conv readBy:', JSON.stringify(conv?.readBy), 'userId:', user?.id);
          const other = conv?.participants?.find((p: any) => p._id !== user?.id);
          if (other) {
            otherUserIdRef.current = other._id;
            setOtherOnline(!!other.isOnline);
            setOtherLastSeen(other.lastSeen || null);
          }
          const readAt = conv?.readBy?.[user?.id || ''];
          console.log('[CHAT] readAt:', readAt);
          if (readAt && msgs.length > 0) {
            const idx = msgs.findIndex((m) => new Date(m.createdAt) > new Date(readAt));
            console.log('[CHAT] unread idx:', idx, 'setting firstUnreadIndex:', idx >= 0 ? idx : null);
            setFirstUnreadIndex(idx >= 0 ? idx : null);
          } else if (!readAt && msgs.length > 0) {
            console.log('[CHAT] no readAt, setting firstUnreadIndex: 0');
            setFirstUnreadIndex(0);
          } else {
            console.log('[CHAT] all read or no msgs, setting firstUnreadIndex: null');
            setFirstUnreadIndex(null);
          }
        } else {
          console.log('[CHAT] convRes not ok, status:', convRes.status);
          setFirstUnreadIndex(msgs.length > 0 ? msgs.length - 1 : null);
        }
      } catch (err) { console.error('chat load error:', err); } finally { setLoading(false); }
    })();
  }, [conversationId, token]);

  useEffect(() => {
    const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('join-conversation', conversationId);
    socket.on('new-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
      socket.emit('mark-read', { conversationId });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    socket.on('user-online', (uid: string) => {
      if (uid === otherUserIdRef.current) setOtherOnline(true);
    });
    socket.on('user-offline', (uid: string) => {
      if (uid === otherUserIdRef.current) {
        setOtherOnline(false);
        setOtherLastSeen(new Date().toISOString());
      }
    });
    return () => {
      socket.emit('leave-conversation', conversationId);
      socket.off('new-message');
      socket.off('user-online');
      socket.off('user-offline');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, token]);

  // Scroll to correct position once loading finishes, then mark read (once)
  useEffect(() => {
    if (loading || messages.length === 0 || hasScrolled.current) return;
    hasScrolled.current = true;
    console.log('[CHAT] scroll effect — firstUnreadIndex:', firstUnreadIndex, 'msgs:', messages.length);
    const timer = setTimeout(() => {
      if (firstUnreadIndex != null && firstUnreadIndex < messages.length - 1) {
        console.log('[CHAT] scrollToIndex:', firstUnreadIndex);
        flatListRef.current?.scrollToIndex({ index: firstUnreadIndex, animated: false, viewPosition: 0 });
      } else {
        console.log('[CHAT] scrollToEnd');
        flatListRef.current?.scrollToEnd({ animated: false });
      }
      // Mark read after scroll lands
      if (socketRef.current) {
        console.log('[CHAT] mark-read emitted after scroll');
        socketRef.current.emit('mark-read', { conversationId });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [loading, messages.length, firstUnreadIndex]);

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
        <TouchableOpacity onPress={goBack} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{username}</Text>
          <Text style={[styles.headerStatus, otherOnline && styles.headerStatusOnline]}>
            {otherOnline ? 'Online' : otherLastSeen ? `Last seen ${formatLastSeen(otherLastSeen)}` : 'Offline'}
          </Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurfaceVariant} />
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.tertiary} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          style={{ flex: 1, backgroundColor: colors.surface }}
          onScrollToIndexFailed={(info) => {
            console.log('[CHAT] scrollToIndexFailed:', info.index, 'highestMeasured:', info.highestMeasuredFrameIndex);
            setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: false }), 200);
          }}
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
    color: colors.onSurfaceVariant,
  },
  headerStatusOnline: {
    color: '#16a34a',
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
