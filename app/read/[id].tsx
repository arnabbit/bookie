import { API_URL, useAuth } from '@/lib/AuthContext';
import { colors, fonts, FORMAT_DISPLAY } from '@/lib/theme';
import CompletionCelebration from '@/components/CompletionCelebration';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Device-local calendar day as 'YYYY-MM-DD' — drives the daily streak boundary.
function localDay(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function BookReaderScreen() {
  const { id, format } = useLocalSearchParams();
  const { token } = useAuth();
  const fmt = (format as string) || 'mini';
  const [book, setBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listHeight, setListHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [streakToast, setStreakToast] = useState<{ current: number } | null>(null);
  const [completion, setCompletion] = useState<{ visible: boolean; streak: number }>({ visible: false, streak: 0 });
  const flatListRef = useRef<FlatList>(null);
  const currentIndexRef = useRef(0);
  const savedPageRef = useRef(0);
  const scrollSettled = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listHeightRef = useRef(0);

  // Fetch book + saved position
  useEffect(() => {
    (async () => {
      try {
        const [bookRes, posRes] = await Promise.all([
          fetch(`${API_URL}/api/books/${id}/read?format=${fmt}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/books/${id}/position?format=${fmt}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (bookRes.ok) setBook(await bookRes.json());
        if (posRes.ok) {
          const pos = await posRes.json();
          savedPageRef.current = pos.page || 0;
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [id, token]);

  // Save reading position debounced (500ms after last page change).
  // The response carries streak + completion signals.
  useEffect(() => {
    if (!id || loading || !scrollSettled.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/books/${id}/position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ page: currentPage, format: fmt, localDate: localDay() }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.streak?.extendedToday) {
          setStreakToast({ current: data.streak.current });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setStreakToast(null), 2800);
        }
        if (data.finishedNow) {
          setCompletion({ visible: true, streak: data.streak?.current || 0 });
        }
      } catch { /* ignore */ }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [currentPage, loading]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // Track listHeight changes — if it shifts after initial render, re-scroll to current page
  useEffect(() => {
    if (!flatListRef.current || listHeight <= 0) return;
    if (listHeightRef.current > 0 && listHeightRef.current !== listHeight) {
      const target = currentIndexRef.current;
      setTimeout(() => flatListRef.current?.scrollToIndex({ index: target, animated: false }), 50);
    }
    listHeightRef.current = listHeight;
  }, [listHeight]);

  const totalPages = book?.pages?.length || 0;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      // Ignore events until initial scroll lands on the saved page
      if (!scrollSettled.current) {
        if (idx === savedPageRef.current || savedPageRef.current === 0) {
          scrollSettled.current = true;
        } else {
          return;
        }
      }
      currentIndexRef.current = idx;
      setCurrentPage(idx);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemLayout = (_: any, index: number) => ({
    length: listHeight,
    offset: listHeight * index,
    index,
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.tertiary} />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.centered}>
        <Text>Book not found</Text>
      </View>
    );
  }

  const readMin = book.readMinutes?.[fmt];

  const renderItem: ListRenderItem<any> = ({ item }) => {
    if (!listHeight) return null;
    return (
      <View style={[styles.pageCard, { height: listHeight }]}>
        {item.content ? (
          <Text style={styles.pageText}>{item.content}</Text>
        ) : (
          <Text style={styles.noContent}>No content on this page.</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: book.title }} />

      <View style={styles.header}>
        <View style={styles.attributionWrap}>
          <Text style={styles.attribution} numberOfLines={1}>
            A retelling of {book.title} by {book.author}
          </Text>
          <Text style={styles.subMeta}>
            {FORMAT_DISPLAY[fmt] || fmt}{readMin ? ` · ~${readMin} min` : ''}
          </Text>
        </View>
        <Text style={styles.pageIndicator}>
          {listHeight > 0 ? currentPage + 1 : (savedPageRef.current + 1)} / {totalPages}
        </Text>
      </View>

      {/* Swipeable vertical card carousel */}
      <View style={{ flex: 1 }} onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h !== listHeightRef.current) {
          setListHeight(h);
        }
      }}>
        {listHeight > 0 && (
          <FlatList
            ref={flatListRef}
            data={book.pages}
            renderItem={renderItem}
            keyExtractor={(_, i) => i.toString()}
            snapToInterval={listHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            initialScrollIndex={savedPageRef.current}
          />
        )}
      </View>

      {/* Streak toast — first read of the day */}
      {streakToast && (
        <View style={styles.streakToast} pointerEvents="none">
          <Ionicons name="flame" size={20} color={colors.onPrimary} />
          <Text style={styles.streakToastText}>
            {streakToast.current}-day streak!
          </Text>
        </View>
      )}

      <CompletionCelebration
        visible={completion.visible}
        bookTitle={book.title}
        streakCurrent={completion.streak}
        purchaseUrl={book.purchaseUrl}
        onClose={() => setCompletion({ visible: false, streak: 0 })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    gap: 12,
  },
  attributionWrap: { flex: 1 },
  attribution: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurface },
  subMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  pageIndicator: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurfaceVariant },
  pageCard: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    justifyContent: 'center',
  },
  pageText: { fontFamily: fonts.headline, fontSize: 17, lineHeight: 28, color: colors.onSurface },
  noContent: { fontFamily: fonts.body, fontSize: 16, color: colors.outlineVariant, marginTop: 40, textAlign: 'center' },
  streakToast: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  streakToastText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
