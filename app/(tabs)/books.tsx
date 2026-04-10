import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL, useAuth } from '@/lib/AuthContext';
import { colors, fonts, typography, radius, shadows, ghostBorder, FORMAT_DISPLAY } from '@/lib/theme';

type BookFormat = 'mini' | 'pro' | 'ultra';

interface CatalogueBook {
  _id: string;
  title: string;
  author: string;
  coverUrl?: string;
  summary: string;
  availableFormats: BookFormat[];
  pageCounts: Record<BookFormat, number>;
}

interface MyBook {
  _id: string;
  title: string;
  author: string;
  coverUrl?: string;
  format: BookFormat;
  pageCount: number;
  readingPosition: number;
  progress: number;
  addedAt: string;
}

type Tab = 'my-books' | 'catalogue';

export default function BooksScreen() {
  const [tab, setTab] = useState<Tab>('my-books');
  const [catalogue, setCatalogue] = useState<CatalogueBook[]>([]);
  const [myBooks, setMyBooks] = useState<MyBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<BookFormat | null>(null);
  const [adding, setAdding] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ openBook?: string; format?: string }>();

  const fetchCatalogue = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/books`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCatalogue(await res.json());
    } catch (err) {
      console.error('Failed to fetch catalogue:', err);
    }
  }, [token]);

  const fetchMyBooks = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/books/my-books`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyBooks(await res.json());
    } catch (err) {
      console.error('Failed to fetch my books:', err);
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchCatalogue(), fetchMyBooks()]);
      setLoading(false);
    })();
  }, [fetchCatalogue, fetchMyBooks]);

  // Refetch my books on screen focus (updates progress bars)
  useFocusEffect(useCallback(() => {
    if (!loading) fetchMyBooks();
  }, [fetchMyBooks, loading]));

  // Deep-link: open catalogue modal for a specific book+format
  useEffect(() => {
    if (params.openBook && catalogue.length > 0) {
      const book = catalogue.find((b) => b._id === params.openBook);
      if (book) {
        setTab('catalogue');
        setSelectedBook(book);
        if (params.format && ['mini', 'pro', 'ultra'].includes(params.format)) {
          setSelectedFormat(params.format as BookFormat);
        } else {
          setSelectedFormat(book.availableFormats.includes('mini') ? 'mini' : null);
        }
      }
    }
  }, [params.openBook, params.format, catalogue]);

  const addToMyBooks = async (bookId: string, format: BookFormat) => {
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/books/my-books`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, format }),
      });
      if (res.ok) {
        await fetchMyBooks();
        setSelectedBook(null);
        setSelectedFormat(null);
        setTab('my-books');
      }
    } catch (err) {
      console.error('Failed to add book:', err);
    } finally {
      setAdding(false);
    }
  };

  const openReader = (book: MyBook) => {
    router.push(`/read/${book._id}?format=${book.format}` as any);
  };

  // Split my books
  const currentlyReading = myBooks.filter((b) => b.progress < 1);
  const completed = myBooks.filter((b) => b.progress >= 1);

  // Filter catalogue by search
  const filteredCatalogue = search.trim()
    ? catalogue.filter((b) =>
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        b.author.toLowerCase().includes(search.toLowerCase())
      )
    : catalogue;

  // ─── Currently Reading Card ────────────────────────────
  const renderReadingCard = ({ item }: { item: MyBook }) => (
    <TouchableOpacity
      style={styles.readingCard}
      onPress={() => openReader(item)}
      activeOpacity={0.7}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.readingCover} />
      ) : (
        <View style={[styles.readingCover, styles.coverPlaceholder]}>
          <Ionicons name="book" size={28} color={colors.outlineVariant} />
        </View>
      )}
      <View style={styles.readingInfo}>
        <View>
          <Text style={styles.readingTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.readingAuthor} numberOfLines={1}>{item.author}</Text>
        </View>
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressLabel}>{Math.round(item.progress * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(item.progress * 100)}%` }]} />
          </View>
        </View>
        <Text style={styles.formatChip}>{FORMAT_DISPLAY[item.format]}</Text>
      </View>
    </TouchableOpacity>
  );

  // ─── Completed Card ────────────────────────────────────
  const renderCompletedCard = ({ item }: { item: MyBook }) => (
    <TouchableOpacity
      style={styles.completedCard}
      onPress={() => openReader(item)}
      activeOpacity={0.7}
    >
      {/* Asymmetric overlap */}
      <View style={styles.coverWrap}>
        <View style={styles.coverHalo} />
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={[styles.completedCover, { opacity: 0.7 }]} />
        ) : (
          <View style={[styles.completedCover, styles.coverPlaceholder, { opacity: 0.7 }]}>
            <Ionicons name="book" size={32} color={colors.outlineVariant} />
          </View>
        )}
      </View>
      <View style={styles.completedMeta}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={styles.completedTitle} numberOfLines={2}>{item.title}</Text>
          <Ionicons name="checkmark-circle" size={18} color={colors.tertiary} style={{ marginLeft: 4 }} />
        </View>
        <Text style={styles.completedAuthor} numberOfLines={1}>{item.author}</Text>
      </View>
    </TouchableOpacity>
  );

  // ─── Catalogue Card ────────────────────────────────────
  const renderCatalogueItem = ({ item }: { item: CatalogueBook }) => (
    <TouchableOpacity
      style={styles.catalogueCard}
      onPress={() => { setSelectedBook(item); setSelectedFormat(item.availableFormats.includes('mini') ? 'mini' : null); }}
      activeOpacity={0.7}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.catalogueCover} />
      ) : (
        <View style={[styles.catalogueCover, styles.coverPlaceholder]}>
          <Ionicons name="book" size={36} color={colors.outlineVariant} />
        </View>
      )}
      <Text style={styles.catalogueTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.catalogueAuthor} numberOfLines={1}>{item.author}</Text>
    </TouchableOpacity>
  );

  // ─── Book Detail Modal ─────────────────────────────────
  const renderDetailModal = () => {
    if (!selectedBook) return null;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setSelectedBook(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {/* Cover Section */}
            <View style={styles.modalCoverSection}>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedBook(null)}>
                <Ionicons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
              {selectedBook.coverUrl ? (
                <Image source={{ uri: selectedBook.coverUrl }} style={styles.modalCover} />
              ) : (
                <View style={[styles.modalCover, styles.coverPlaceholder]}>
                  <Ionicons name="book" size={48} color={colors.outlineVariant} />
                </View>
              )}
              <Text style={styles.modalAuthorLabel}>Authored By</Text>
              <Text style={styles.modalAuthorName}>{selectedBook.author}</Text>
            </View>

            {/* Content Section */}
            <View style={styles.modalContentSection}>
              <Text style={styles.modalBookTitle}>{selectedBook.title}</Text>

              {selectedBook.summary ? (
                <>
                  <Text style={styles.sectionLabel}>Synopsis</Text>
                  <Text style={styles.synopsisText}>{selectedBook.summary}</Text>
                </>
              ) : null}

              {/* Format Picker */}
              <Text style={styles.sectionLabel}>Select Reading Experience</Text>
              <View style={styles.formatGrid}>
                {(['mini', 'pro', 'ultra'] as BookFormat[]).map((f) => {
                  const available = selectedBook.availableFormats.includes(f);
                  const pages = selectedBook.pageCounts[f];
                  const isSelected = selectedFormat === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[
                        styles.formatOption,
                        available && !isSelected && styles.formatOptionAvailable,
                        isSelected && styles.formatOptionSelected,
                        !available && styles.formatOptionDisabled,
                      ]}
                      disabled={!available || adding}
                      onPress={() => setSelectedFormat(f)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[
                          styles.formatOptionLabel,
                          isSelected && { color: colors.onSurface },
                          !available && { color: colors.outlineVariant },
                        ]}>
                          {FORMAT_DISPLAY[f]}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color={colors.tertiary} />}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Ionicons
                          name={f === 'ultra' ? 'book-outline' : 'time-outline'}
                          size={12}
                          color={available ? colors.tertiary : colors.outlineVariant}
                        />
                        <Text style={[
                          styles.formatOptionPages,
                          available && { color: colors.tertiary },
                        ]}>
                          {available ? `${pages} PAGES` : 'N/A'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add Button */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.addBtnWrap, !selectedFormat && { opacity: 0.4 }]}
                  onPress={() => selectedFormat && addToMyBooks(selectedBook._id, selectedFormat)}
                  disabled={!selectedFormat || adding}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryContainer]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.addBtn}
                  >
                    {adding ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <>
                        <Ionicons name="library-outline" size={20} color={colors.onPrimary} />
                        <Text style={styles.addBtnText}>Add to My Books</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.tertiary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.header}>Books</Text>
      <Text style={styles.headerSubtitle}>Your curated reading collection.</Text>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.onSurfaceVariant + '99'} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search books or authors..."
          placeholderTextColor={colors.onSurfaceVariant + '80'}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={styles.tabBtn} onPress={() => setTab('my-books')}>
          <Text style={[styles.tabText, tab === 'my-books' && styles.tabTextActive]}>My Books</Text>
          {tab === 'my-books' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabBtn} onPress={() => setTab('catalogue')}>
          <Text style={[styles.tabText, tab === 'catalogue' && styles.tabTextActive]}>Catalogue</Text>
          {tab === 'catalogue' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {tab === 'my-books' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Currently Reading */}
          {currentlyReading.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Currently Reading</Text>
              <Text style={styles.sectionSubtitle}>Pick up where you left off.</Text>
              {currentlyReading.map((item) => (
                <View key={item._id}>{renderReadingCard({ item })}</View>
              ))}
            </View>
          )}

          {/* Completed (collapsible) */}
          {completed.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.completedHeader}
                onPress={() => setCompletedExpanded(!completedExpanded)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionTitle}>Completed</Text>
                <View style={styles.completedBadgeRow}>
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>{completed.length}</Text>
                  </View>
                  <Ionicons
                    name={completedExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.onSurfaceVariant}
                  />
                </View>
              </TouchableOpacity>
              {completedExpanded && (
                <View style={styles.completedGrid}>
                  {completed.map((item) => (
                    <View key={item._id} style={{ width: '48%' }}>
                      {renderCompletedCard({ item })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {myBooks.length === 0 && (
            <View style={styles.emptyWrap}>
              <Ionicons name="library-outline" size={48} color={colors.surfaceContainerHighest} />
              <Text style={styles.emptyText}>No books yet</Text>
              <Text style={styles.emptyHint}>Browse the catalogue to add books</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        filteredCatalogue.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No books in the catalogue.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredCatalogue}
            renderItem={renderCatalogueItem}
            keyExtractor={(item) => item._id}
            numColumns={2}
            contentContainerStyle={styles.catalogueList}
            columnWrapperStyle={styles.catalogueRow}
          />
        )
      )}

      {renderDetailModal()}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    fontFamily: fonts.headlineBold,
    fontSize: 36,
    color: colors.onSurface,
    paddingHorizontal: 24,
    paddingTop: 56,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurfaceVariant,
    paddingHorizontal: 24,
    marginTop: 2,
    marginBottom: 16,
  },

  // Search
  searchWrap: {
    marginHorizontal: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    ...shadows.sm,
  },
  searchIcon: { marginLeft: 16 },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurface,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 32,
    marginBottom: 8,
  },
  tabBtn: { paddingBottom: 8 },
  tabText: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.onSurfaceVariant + '60',
  },
  tabTextActive: {
    color: colors.onSurface,
  },
  tabIndicator: {
    height: 3,
    backgroundColor: colors.tertiary,
    borderRadius: 2,
    marginTop: 6,
  },

  // Sections
  section: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 24,
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 16,
  },

  // Currently Reading Card
  readingCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    gap: 16,
    marginBottom: 12,
    ...ghostBorder(0.1),
    ...shadows.sm,
  },
  readingCover: {
    width: 80,
    height: 107,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  readingInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  readingTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 17,
    color: colors.onSurface,
  },
  readingAuthor: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  progressSection: { marginTop: 8 },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.tertiary,
    borderRadius: 3,
  },
  formatChip: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.onSurfaceVariant + '99',
    marginTop: 6,
  },

  // Completed
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  completedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedBadge: {
    backgroundColor: colors.tertiary + '1a',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    color: colors.tertiary,
  },
  completedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  completedCard: {
    marginBottom: 20,
  },
  coverWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  coverHalo: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: -10,
    bottom: -10,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 8,
  },
  completedCover: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    resizeMode: 'cover',
    ...shadows.md,
  },
  completedMeta: {},
  completedTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 16,
    color: colors.onSurface,
    flex: 1,
  },
  completedAuthor: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },

  // Catalogue
  catalogueList: { paddingHorizontal: 16, paddingBottom: 100 },
  catalogueRow: { justifyContent: 'space-between' },
  catalogueCard: {
    width: '48%',
    marginBottom: 20,
  },
  catalogueCover: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    resizeMode: 'cover',
    backgroundColor: colors.surfaceContainerHighest,
    ...shadows.sm,
  },
  catalogueTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 14,
    color: colors.onSurface,
    marginTop: 10,
  },
  catalogueAuthor: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  coverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.onSurfaceVariant, marginTop: 12 },
  emptyHint: { fontFamily: fonts.body, fontSize: 13, color: colors.outlineVariant, marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { paddingBottom: 40 },
  modalCoverSection: {
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
    zIndex: 10,
  },
  modalCover: {
    width: 200,
    height: 300,
    borderRadius: 4,
    resizeMode: 'cover',
    transform: [{ rotate: '-1deg' }],
    ...shadows.lg,
  },
  modalAuthorLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginTop: 24,
  },
  modalAuthorName: {
    fontFamily: fonts.headlineBold,
    fontSize: 18,
    color: colors.onSurface,
    marginTop: 4,
  },
  modalContentSection: {
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  modalBookTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 32,
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
    marginTop: 8,
  },
  synopsisText: {
    fontFamily: fonts.headlineItalic,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.onSurface + 'e6',
    lineHeight: 26,
    marginBottom: 24,
  },
  formatGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  formatOption: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerLow,
  },
  formatOptionAvailable: {},
  formatOptionSelected: {
    borderWidth: 2,
    borderColor: colors.tertiary,
    backgroundColor: colors.surfaceContainerLowest,
  },
  formatOptionDisabled: {
    backgroundColor: colors.surfaceContainerLow + '80',
  },
  formatOptionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },
  formatOptionPages: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.onSurfaceVariant,
  },
  modalActions: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  addBtnWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  addBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onPrimary,
    letterSpacing: 0.5,
  },
});
