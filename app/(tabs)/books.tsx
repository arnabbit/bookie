import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/lib/AuthContext';
import { useAuth } from '@/lib/AuthContext';

interface Book {
  _id: string;
  title: string;
  author: string;
  format: 'mini' | 'pro' | 'ultra';
  pageCounts: { mini: number; pro: number; ultra: number };
  coverUrl?: string;
}

type BookFormat = 'mini' | 'pro' | 'ultra';

const FORMAT_LABELS: Record<BookFormat, string> = {
  mini: 'Mini',
  pro: 'Pro',
  ultra: 'Ultra',
};

const FORMAT_COLORS: Record<BookFormat, string> = {
  mini: '#22c55e',
  pro: '#6366f1',
  ultra: '#f59e0b',
};

// Mock data
const MOCK_BOOKS: Book[] = [
  {
    _id: 'prince',
    title: 'The Prince',
    author: 'Niccolò Machiavelli',
    format: 'mini',
    coverUrl: undefined,
    pageCounts: { mini: 26, pro: 130, ultra: 520 },
  },
  {
    _id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    format: 'pro',
    coverUrl: undefined,
    pageCounts: { mini: 12, pro: 60, ultra: 240 },
  },
  {
    _id: 'art-of-war',
    title: 'The Art of War',
    author: 'Sun Tzu',
    format: 'ultra',
    coverUrl: undefined,
    pageCounts: { mini: 13, pro: 65, ultra: 260 },
  },
  {
    _id: 'republic',
    title: 'The Republic',
    author: 'Plato',
    format: 'mini',
    coverUrl: undefined,
    pageCounts: { mini: 10, pro: 50, ultra: 400 },
  },
  {
    _id: 'origin',
    title: 'On the Origin of Species',
    author: 'Charles Darwin',
    format: 'pro',
    coverUrl: undefined,
    pageCounts: { mini: 15, pro: 75, ultra: 350 },
  },
  {
    _id: 'art',
    title: 'The Art of War',
    author: 'Sun Tzu',
    format: 'mini',
    coverUrl: undefined,
    pageCounts: { mini: 13, pro: 65, ultra: 260 },
  },
  {
    _id: 'communist',
    title: 'The Communist Manifesto',
    author: 'Karl Marx',
    format: 'pro',
    coverUrl: undefined,
    pageCounts: { mini: 5, pro: 25, ultra: 100 },
  },
  {
    _id: 'leviathan',
    title: 'Leviathan',
    author: 'Thomas Hobbes',
    format: 'ultra',
    coverUrl: undefined,
    pageCounts: { mini: 16, pro: 80, ultra: 712 },
  },
];

export default function BooksScreen() {
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/books`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Merge with mock page counts
          const enriched = data.map((b: any) => ({
            ...b,
            format: b.format || 'mini',
            pageCounts: b.pageCounts || { mini: 10, pro: 50, ultra: 200 },
          }));
          setBooks(enriched.length > 0 ? enriched : MOCK_BOOKS);
        }
      } catch (err) {
        console.error('Failed to fetch books:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const setBookFormat = (bookId: string, format: BookFormat) => {
    setBooks((prev) =>
      prev.map((b) => (b._id === bookId ? { ...b, format } : b))
    );
  };

  const openBook = (book: Book) => {
    router.push(`/read/${book._id}?format=${book.format}` as any);
  };

  const renderBook = ({ item }: { item: Book }) => {
    const pageLabel = item.pageCounts
      ? `${item.pageCounts[item.format]} pages`
      : '';

    return (
      <View style={styles.bookCard}>
        <TouchableOpacity
          style={styles.bookTouch}
          onPress={() => openBook(item)}
        >
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="book" size={40} color="#cbd5e1" />
            </View>
          )}
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.author} numberOfLines={1}>{item.author}</Text>
        </TouchableOpacity>

        {/* Format selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.formatScroll}
          style={{ paddingHorizontal: 8, paddingBottom: 6 }}
        >
          {(['mini', 'pro', 'ultra'] as BookFormat[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.formatBtn,
                item.format === f && styles.formatBtnActive,
                item.format === f && { borderColor: FORMAT_COLORS[f] },
                item.format === f && {
                  backgroundColor: FORMAT_COLORS[f] + '15',
                },
              ]}
              onPress={() => setBookFormat(item._id, f)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.formatBtnText,
                  item.format === f && { color: FORMAT_COLORS[f], fontWeight: '700' },
                ]}
              >
                {FORMAT_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.pageLabel}>{pageLabel}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!books || books.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No books available yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Books</Text>
      <FlatList
        data={books}
        renderItem={renderBook}
        keyExtractor={(item) => item._id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingBottom: 10 },
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: { paddingHorizontal: 12 },
  row: { justifyContent: 'space-between' },
  bookCard: {
    width: '48%',
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookTouch: {},
  cover: { width: '100%', height: 140, resizeMode: 'cover' },
  coverPlaceholder: {
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    height: 140,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    padding: 10,
    paddingBottom: 2,
  },
  author: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  formatScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  formatBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 4,
  },
  formatBtnActive: {
    borderWidth: 1,
  },
  formatBtnText: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  pageLabel: {
    fontSize: 10,
    color: '#bbb',
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
