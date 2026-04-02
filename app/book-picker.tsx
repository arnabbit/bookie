import { API_URL, useAuth } from '@/lib/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { io } from 'socket.io-client';

export default function BookPickerScreen() {
  const { bookId, conversationId } = useLocalSearchParams<{ bookId: string; conversationId: string }>();
  const { token, user } = useAuth();
  const router = useRouter();

  const [book, setBook] = useState<any>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/books/${bookId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setBook(await res.json());
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [bookId, token]);

  const handleSendPage = async (page: any) => {
    try {
      const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
      socket.on('connect', () => {
        socket.emit('send-message', {
          conversationId,
          content: '',
          type: 'book-share' as const,
          sharedBookPage: {
            book: bookId,
            bookTitle: book.title,
            pageNumber: page.pageNumber,
            content: page.content || '',
          },
        });
        setTimeout(() => {
          socket.disconnect();
          router.back();
          router.back();
        }, 500);
      });
    } catch { /* ignore */ }
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#6366f1" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{book?.title}</Text>
      </View>

      <FlatList
        data={book?.pages || []}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.pageItem,
              selectedPage === item.pageNumber && styles.pageItemSelected,
            ]}
            onPress={() => setSelectedPage(item.pageNumber)}
          >
            <Text style={styles.pageNumber}>Page {item.pageNumber}</Text>
            <Text style={styles.pagePreview} numberOfLines={2}>
              {item.content?.substring(0, 100) || 'No text'}
            </Text>
          </TouchableOpacity>
        )}
      />

      {selectedPage !== null && (
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={() => {
            const page = book.pages.find((p: any) => p.pageNumber === selectedPage);
            if (page) handleSendPage(page);
          }}
        >
          <Text style={styles.sendBtnText}>Share this Page</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  list: { padding: 8 },
  pageItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pageItemSelected: { backgroundColor: '#f0eeff' },
  pageNumber: { fontSize: 14, fontWeight: '700', color: '#6366f1' },
  pagePreview: { fontSize: 13, color: '#666', marginTop: 4 },
  sendBtn: {
    backgroundColor: '#6366f1',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
