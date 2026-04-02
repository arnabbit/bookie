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

interface Message {
  _id: string;
  content: string;
  type: 'text' | 'book-share';
  sender: { _id: string; username: string; avatar?: string };
  sharedBookPage?: { book: string; bookTitle: string; pageNumber: number; content: string };
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

  // Fetch messages
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [conversationId, token]);

  // Socket connection
  useEffect(() => {
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
    });
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
      socketRef.current.emit('send-message', {
        conversationId,
        content: text,
        type,
        sharedBookPage: bookPage,
      });
      // Optimistic local add
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

  // Fetch books for picker
  const openBookPicker = async () => {
    try {
      const res = await fetch(`${API_URL}/api/books`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBooks(await res.json());
      }
    } catch {}
    setShowBookPicker(true);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const senderUsername = item.sender?.username ?? item.sender;
    const myUsername = user?.username;
    const isMine = senderUsername === myUsername;

    // Common wrapper for all message types
    if (item.type === 'book-share' && item.sharedBookPage) {
      return (
        <View style={styles.msgRow}>
          <View style={[styles.msgContainer, isMine ? styles.msgRight : styles.msgLeft, { flex: undefined }]}>
          <TouchableOpacity
            style={styles.bookShareCard}
            onPress={() =>
              (router as any).push({
                pathname: '/read/[id]',
                params: { id: item.sharedBookPage.book },
              })
            }
          >
            {/* Instagram-style header */}
            <View style={styles.bookShareHeader}>
              <View style={styles.bookShareAvatar}>
                <Ionicons name="book" size={18} color="#6366f1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bookShareTitle} numberOfLines={1}>
                  {item.sharedBookPage.bookTitle || 'Untitled'}
                </Text>
                <Text style={styles.bookSharePage}>
                  Page {item.sharedBookPage.pageNumber + 1}
                </Text>
              </View>
              <View style={styles.bookShareSentBy}>
                <Text style={styles.bookShareSentByText}>
                  {item.sender.username}
                </Text>
                <Text style={styles.bookShareTimestamp}>
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.bookShareDivider} />

            {/* Page content preview */}
            {item.sharedBookPage.content ? (
              <Text style={styles.bookShareContent} numberOfLines={8}>
                {item.sharedBookPage.content}
              </Text>
            ) : (
              <Text style={styles.bookShareEmpty}>No content on this page</Text>
            )}

            {/* Footer */}
            <View style={styles.bookShareFooter}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color="#6366f1" />
              <Text style={styles.bookShareFooterText}>Tap to read</Text>
            </View>
          </TouchableOpacity>
        </View>
        </View>
      );
    }

    return (
      <View style={styles.msgRow}>
        <View style={[styles.msgContainer, isMine ? styles.msgRight : styles.msgLeft]}>
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={isMine ? styles.mineText : styles.theirsText}>{item.content}</Text>
            <Text style={isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs}>
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
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
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{username}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#6366f1" />
      ) : (
        <View style={styles.bgPattern}>
          <FlatList
            data={messages}
            keyExtractor={(item) => item._id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => {
              // Scroll to bottom
            }}
          />
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.bookShareBtn} onPress={openBookPicker}>
          <Ionicons name="book-outline" size={22} color="#6366f1" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColor="#aaa"
          multiline
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Ionicons
            name="send"
            size={20}
            color={input.trim() ? '#fff' : '#ccc'}
          />
        </TouchableOpacity>
      </View>

      {/* Book Picker Modal */}
      <Modal visible={showBookPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share a Book Page</Text>
              <TouchableOpacity onPress={() => setShowBookPicker(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={books}
              keyExtractor={(b) => b._id}
              ListEmptyComponent={<Text style={styles.empty}>No books</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.bookItem}
                  onPress={() =>
                    (router as any).push({
                      pathname: '/book-picker',
                      params: { bookId: item._id, conversationId },
                    })
                  }
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
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  bgPattern: { flex: 1, backgroundColor: '#fafafa' },
  messagesList: { paddingVertical: 12, paddingHorizontal: 10, flexGrow: 1 },
  // msgRow is a full-width flex row; msgContainer inside gets alignSelf for alignment
  msgRow: { flexDirection: 'row', width: '100%', marginVertical: 3 },
  msgContainer: { maxWidth: '85%' },
  msgRight: { alignSelf: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start' },
  // Bubbles
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 60,
  },
  bubbleMine: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
    shadowColor: '#6366f1',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubbleTheirs: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  mineText: { fontSize: 15, color: '#fff', lineHeight: 20 },
  theirsText: { fontSize: 15, color: '#1a1a2e', lineHeight: 20 },
  bubbleTimeMine: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeTheirs: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  // Book share card — Instagram post style
  bookShareCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#e8e8f0',
    shadowColor: '#6366f1',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bookShareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  bookShareAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0eeff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookShareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  bookSharePage: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  bookShareSentBy: {
    alignItems: 'flex-end',
  },
  bookShareSentByText: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '600',
  },
  bookShareTimestamp: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 2,
  },
  bookShareDivider: {
    height: 1,
    backgroundColor: '#f0f0f5',
  },
  bookShareContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bookShareEmpty: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    paddingVertical: 20,
  },
  bookShareFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
  },
  bookShareFooterText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
  },
  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 6,
  },
  bookShareBtn: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#f0eeff',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#6366f1',
  },
  sendBtnDisabled: { opacity: 0.4 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  bookItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  bookItemTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  bookItemAuthor: { fontSize: 13, color: '#999', marginTop: 2 },
  empty: { textAlign: 'center', padding: 24, color: '#999' },
});
